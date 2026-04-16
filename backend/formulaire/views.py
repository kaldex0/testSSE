import base64
import io
import json
import os
import math
import logging
from datetime import date

from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.db.models import F, Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from .models import TestSubmission
logger = logging.getLogger(__name__)



BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LOGO_PATH = os.path.join(BASE_DIR, "images", "1770807021525.jpg")
HAS_LOGO = os.path.exists(LOGO_PATH)
FREE_TEXT_MAX_CHARS = 280
PICTOGRAM_TEXT_MAX_CHARS = 90


@api_view(["GET"])
@permission_classes([AllowAny])
def api_root(request):
	return Response(
		{
			"message": "API Test Accueil SSE operationnelle",
			"endpoints": {
				"pdf": "/api/pdf",
				"tests": "/api/tests",
				"admin_tests": "/api/admin/tests",
				"token": "/api/token",
				"token_refresh": "/api/token/refresh",
			},
		}
	)


@api_view(["GET"])
@permission_classes([AllowAny])
def api_health(request):
	return Response({"status": "ok"})


def _truncate_text(value, max_chars):
	if isinstance(value, str):
		return value[:max_chars]
	return value


def _draw_wrapped_text(pdf, text, x, y, max_width, font_name, font_size, leading=14):
	words = text.split()
	line = ""
	for word in words:
		candidate = f"{line} {word}".strip()
		if stringWidth(candidate, font_name, font_size) <= max_width:
			line = candidate
		else:
			if line:
				pdf.drawString(x, y, line)
				y -= leading
			line = word
	if line:
		pdf.drawString(x, y, line)
		y -= leading
	return y


def _draw_header(pdf, width, height, margin_x, participant, logo_path, test_label="Test Accueil SSE"):
	y = height - 2 * cm
	logo_size = 1.6 * cm
	text_x = margin_x
	if logo_path and HAS_LOGO:
		try:
			pdf.drawImage(
				logo_path,
				margin_x,
				y - logo_size + 25,
				width=logo_size,
				height=logo_size,
				preserveAspectRatio=True,
				mask="auto",
			)
			text_x = margin_x + logo_size + 12
		except Exception:
			logger.exception("Impossible de dessiner le logo PDF (%s)", logo_path)

	pdf.setFillColor(colors.HexColor("#0f172a"))
	pdf.setFont("Helvetica-Bold", 16)
	pdf.drawString(text_x, y, test_label)
	pdf.setFillColor(colors.HexColor("#475569"))
	pdf.setFont("Helvetica", 11)
	pdf.drawString(text_x, y - 14, "Goron systemes")

	pdf.setStrokeColor(colors.HexColor("#cbd5e1"))
	pdf.setLineWidth(1)
	pdf.line(margin_x, y - 22, width - margin_x, y - 22)

	box_y = y - 48
	box_height = 20
	pdf.setFillColor(colors.HexColor("#f1f5f9"))
	pdf.roundRect(margin_x, box_y - 6, width - 2 * margin_x, box_height, 6, fill=1, stroke=0)
	pdf.setFillColor(colors.HexColor("#0f172a"))
	pdf.setFont("Helvetica-Bold", 9)
	pdf.drawString(margin_x + 8, box_y + 2, "Nom:")
	pdf.setFont("Helvetica", 9)
	pdf.drawString(margin_x + 38, box_y + 2, participant.get("nom", "") or "-")
	pdf.setFont("Helvetica-Bold", 9)
	pdf.drawString(margin_x + 190, box_y + 2, "Prénom:")
	pdf.setFont("Helvetica", 9)
	pdf.drawString(margin_x + 236, box_y + 2, participant.get("prénom", "") or "-")
	pdf.setFont("Helvetica-Bold", 9)
	pdf.drawString(margin_x + 380, box_y + 2, "Date:")
	pdf.setFont("Helvetica", 9)
	pdf.drawString(margin_x + 410, box_y + 2, participant.get("date", "") or "-")

	return box_y - 18


def _draw_section_title(pdf, title, x, y, width):
	pdf.setFillColor(colors.HexColor("#0f766e"))
	pdf.roundRect(x, y - 14, width, 18, 6, fill=1, stroke=0)
	pdf.setFillColor(colors.white)
	pdf.setFont("Helvetica-Bold", 10)
	pdf.drawString(x + 8, y - 10, title)
	pdf.setFillColor(colors.HexColor("#0f172a"))
	return y - 24


def _extract_questionnaire_rows(payload, answers):
	questionnaire = payload.get("questionnaire")
	if isinstance(questionnaire, list):
		rows = []
		for item in questionnaire:
			if not isinstance(item, dict):
				continue
			label = str(item.get("label") or "").strip()
			if not label:
				continue
			index = item.get("index")
			if isinstance(index, int):
				question_label = f"Q{index}. {label}"
			else:
				question_label = label
			answer = str(item.get("answer") or "").strip() or "-"
			rows.append((question_label, answer))
		if rows:
			return rows

	return [
		("Q1. Quels sont les 3 domaines d'application du MASE ?", answers.get("q1")),
		("Q2. Citez au moins 4 bons gestes en matière de santé - hygiène de vie :", answers.get("q2")),
		("Q3. Comment limiter les problèmes de santé liés au travail sur écran ?", answers.get("q3")),
		("Q4. Sur 600 accidents, combien sont mortels ?", answers.get("q4")),
		("Q5. À quoi sert un plan de prévention en sécurité au travail ?", answers.get("q5")),
		("Q6. Que signifie le sigle EPI dans la sécurité au travail ?", answers.get("q6")),
		("Q7. Citez 4 sortes d'EPI ?", answers.get("q7")),
		("Q8. Grâce à quel type d'éléments pouvons-nous réduire les risques sur les chantiers ?", answers.get("q8")),
		("Q9. À quoi correspondent les pictogrammes suivants ?", answers.get("q9")),
		("Q10. Que dois-je faire face à un interlocuteur virulent ?", answers.get("q10")),
		("Q11. Quels sont, dans le bon ordre chronologique, les 3 principes des premiers secours ?", answers.get("q11")),
		("Q12. Pour faire des économies et être plus écologique, je peux :", answers.get("q12")),
		("Q13. Quels gestes sont préconisés par l'écoconduite ?", answers.get("q13")),
		("Q14. Dans le cadre de notre démarche, vous serez invités à :", answers.get("q14")),
	]


def _build_questionnaire_from_results(qcm_results, free_results):
	rows = []
	index = 1

	if isinstance(qcm_results, list):
		for item in qcm_results:
			if not isinstance(item, dict):
				continue
			label = str(item.get("label") or "").strip()
			if not label:
				continue
			selected = str(item.get("selected") or "").strip() or "-"
			rows.append(
				{
					"index": index,
					"id": str(item.get("id") or f"qcm-{index}"),
					"label": label,
					"section": "qcm",
					"type": "qcm",
					"answer": selected,
				}
			)
			index += 1

	if isinstance(free_results, list):
		for item in free_results:
			if not isinstance(item, dict):
				continue
			label = str(item.get("label") or "").strip()
			if not label:
				continue
			answer = str(item.get("answer") or "").strip()
			if not answer and isinstance(item.get("pictograms"), list):
				parts = []
				for picto in item.get("pictograms"):
					if not isinstance(picto, dict):
						continue
					picto_answer = str(picto.get("answer") or "").strip()
					if picto_answer:
						parts.append(picto_answer)
				answer = " | ".join(parts)
			answer = answer or "-"
			rows.append(
				{
					"index": index,
					"id": str(item.get("id") or f"free-{index}"),
					"label": label,
					"section": "libre",
					"type": "libre",
					"answer": answer,
				}
			)
			index += 1

	return rows


def _yes_no(value):
	if value is True:
		return "Oui"
	if value is False:
		return "Non"
	if isinstance(value, str):
		return "Oui" if value.lower() in {"oui", "yes", "true"} else "Non"
	return "Non"


def _extract_test_type(payload):
	if not isinstance(payload, dict):
		return "test-accueil"
	test_type = str(payload.get("testType") or "").strip()
	if test_type in {"test-accueil", "stagiaire", "technicien", "service-administratif"}:
		return test_type
	return "test-accueil"


def _is_data_url(value):
	return isinstance(value, str) and value.startswith("data:image")


def _draw_signature_image(pdf, data_url, x, y, width=110, height=26):
	try:
		_, encoded = data_url.split(",", 1)
		data = base64.b64decode(encoded)
		image = ImageReader(io.BytesIO(data))
		pdf.drawImage(image, x, y - height + 6, width=width, height=height, mask="auto")
		return True
	except Exception:
		logger.exception("Impossible de dessiner une signature dans le PDF")
		return False


@csrf_exempt
def _render_pdf(pdf, payload):
	participant = payload.get("participant", {})
	answers = payload.get("answers", {})
	result = payload.get("result", {})
	signatures = payload.get("signatures", {})
	observations = payload.get("observations", {})
	test_label = str(payload.get("testLabel") or "Test Accueil SSE")

	width, height = A4
	margin_x = 2 * cm
	logo_path = LOGO_PATH

	y = _draw_header(pdf, width, height, margin_x, participant, logo_path, test_label)
	max_width = width - 2 * margin_x
	y = _draw_section_title(pdf, "Questionnaire", margin_x, y, max_width)

	pdf.setFont("Helvetica", 10)
	max_width = width - 2 * margin_x

	questions = _extract_questionnaire_rows(payload, answers)

	for index, (label, value) in enumerate(questions, start=1):
		if y < 5 * cm:
			pdf.showPage()
			y = _draw_header(pdf, width, height, margin_x, participant, logo_path, test_label)
			y = _draw_section_title(pdf, "Questionnaire (suite)", margin_x, y, max_width)
			pdf.setFont("Helvetica", 10)

		pdf.setFont("Helvetica-Bold", 10)
		question_label = label if str(label).startswith("Q") else f"Q{index}. {label}"
		y = _draw_wrapped_text(pdf, question_label, margin_x, y, max_width, "Helvetica-Bold", 10)
		pdf.setFont("Helvetica", 10)
		if isinstance(value, list):
			value_text = ", ".join(str(v) for v in value if v)
		else:
			value_text = str(value or "")
		value_text = value_text.strip() or "-"
		y = _draw_wrapped_text(pdf, f"Réponse : {value_text}", margin_x + 12, y, max_width - 12, "Helvetica", 10)
		y -= 6

	if y < 7 * cm:
		pdf.showPage()
		y = _draw_header(pdf, width, height, margin_x, participant, logo_path, test_label)

	y = _draw_section_title(pdf, "Résultat", margin_x, y, max_width)
	pdf.setFont("Helvetica", 10)
	pdf.drawString(margin_x, y, f"Type de test : {test_label}")
	y -= 16
	pdf.drawString(margin_x, y, f"Résultat : {result.get('score', '')} /20")
	y -= 16
	pdf.drawString(margin_x, y, f"Test validé : {_yes_no(result.get('validé'))}")
	y -= 14
	pdf.drawString(margin_x, y, f"Renforcement ultérieur : {_yes_no(result.get('renforcement'))}")
	y -= 14
	pdf.drawString(margin_x, y, f"Correction présentée : {_yes_no(result.get('correction'))}")
	y -= 22

	if y < 8 * cm:
		pdf.showPage()
		y = _draw_header(pdf, width, height, margin_x, participant, logo_path, test_label)

	y = _draw_section_title(pdf, "Signatures", margin_x, y, max_width)
	pdf.setFont("Helvetica", 10)
	signature_height = 34
	participant_signature = signatures.get("participant", "")
	animateur_signature = signatures.get("animateur", "")

	pdf.drawString(margin_x, y, "Signature du participant :")
	y -= 18
	if _is_data_url(participant_signature):
		drawn = _draw_signature_image(
			pdf,
			participant_signature,
			margin_x + 12,
			y,
			width=200,
			height=signature_height,
		)
		if not drawn:
			pdf.drawString(margin_x + 12, y, "-")
	else:
		pdf.drawString(margin_x + 12, y, participant_signature)
	y -= signature_height + 16

	pdf.drawString(margin_x, y, "Nom et signature de l'animateur :")
	y -= 18
	if _is_data_url(animateur_signature):
		drawn = _draw_signature_image(
			pdf,
			animateur_signature,
			margin_x + 12,
			y,
			width=220,
			height=signature_height,
		)
		if not drawn:
			pdf.drawString(margin_x + 12, y, "-")
	else:
		pdf.drawString(margin_x + 12, y, animateur_signature)
	y -= signature_height + 12

	if y < 6 * cm:
		pdf.showPage()
		y = _draw_header(pdf, width, height, margin_x, participant, logo_path, test_label)

	y = _draw_section_title(pdf, "Observations", margin_x, y, max_width)
	pdf.setFont("Helvetica", 10)
	pdf.drawString(margin_x, y, "Observation de l'animateur :")
	y -= 14
	_draw_wrapped_text(
		pdf,
		observations.get("animateur", ""),
		margin_x + 12,
		y,
		max_width - 12,
		"Helvetica",
		10,
	)


@csrf_exempt
def generate_pdf(request):
	if request.method != "POST":
		return JsonResponse({"error": "POST required"}, status=405)

	try:
		payload = json.loads(request.body.decode("utf-8"))
	except json.JSONDecodeError:
		return JsonResponse({"error": "Invalid JSON"}, status=400)

	response = HttpResponse(content_type="application/pdf")
	response["Content-Disposition"] = "attachment; filename=\"test_accueil_sse.pdf\""

	pdf = canvas.Canvas(response, pagesize=A4, pageCompression=1)
	_render_pdf(pdf, payload)
	pdf.showPage()
	pdf.save()

	return response


@api_view(["POST"])
@permission_classes([AllowAny])
def create_test_submission(request):
	data = request.data or {}
	payload = data.get("pdfPayload") or data.get("pdf_payload") or {}
	answers = payload.get("answers") if isinstance(payload.get("answers"), dict) else {}
	if answers:
		answers["q2"] = _truncate_text(answers.get("q2", ""), FREE_TEXT_MAX_CHARS)
		answers["q7"] = _truncate_text(answers.get("q7", ""), FREE_TEXT_MAX_CHARS)
		answers["q9"] = _truncate_text(answers.get("q9", ""), PICTOGRAM_TEXT_MAX_CHARS * 4 + 24)
		payload["answers"] = answers

	free_results = data.get("freeResults", [])
	if isinstance(free_results, list):
		for item in free_results:
			if not isinstance(item, dict):
				continue
			item_id = item.get("id")
			if item_id in {"free-1", "free-2"}:
				item["answer"] = _truncate_text(item.get("answer", ""), FREE_TEXT_MAX_CHARS)
			if item_id == "free-3" and isinstance(item.get("pictograms"), list):
				for picto in item["pictograms"]:
					if isinstance(picto, dict):
						picto["answer"] = _truncate_text(picto.get("answer", ""), PICTOGRAM_TEXT_MAX_CHARS)
		data["freeResults"] = free_results

	participant = payload.get("participant", {})
	nom = (participant.get("nom") or "").strip()
	prénom = (participant.get("prénom") or "").strip()
	if not nom or not prénom:
		return Response({"error": "Participant requis"}, status=status.HTTP_400_BAD_REQUEST)

	date_str = participant.get("date")
	participant_date = None
	if isinstance(date_str, str) and date_str:
		try:
			participant_date = date.fromisoformat(date_str)
		except ValueError:
			participant_date = None

	stats = data.get("stats", {})
	qcm_results = data.get("qcmResults", [])
	free_results = data.get("freeResults", [])
	score20 = stats.get("score20")

	submission = TestSubmission.objects.create(
		participant_nom=nom,
		participant_prenom=prénom,
		participant_date=participant_date,
		score20=score20,
		stats=stats,
		qcm_results=qcm_results,
		free_results=free_results,
		pdf_payload=payload,
	)

	return Response({"id": submission.id}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_test_submissions(request):
	query = (request.query_params.get("q") or "").strip()
	date_from = (request.query_params.get("date_from") or "").strip()
	date_to = (request.query_params.get("date_to") or "").strip()
	status_filter = (request.query_params.get("status") or "all").strip()
	test_type_filter = (request.query_params.get("test_type") or "all").strip()
	sort_by = (request.query_params.get("sort") or "recent").strip()

	try:
		score_min = float(request.query_params.get("score_min")) if request.query_params.get("score_min") else None
	except (TypeError, ValueError):
		score_min = None
	try:
		score_max = float(request.query_params.get("score_max")) if request.query_params.get("score_max") else None
	except (TypeError, ValueError):
		score_max = None

	try:
		page = int(request.query_params.get("page", "1"))
	except ValueError:
		page = 1
	try:
		page_size = int(request.query_params.get("page_size", "10"))
	except ValueError:
		page_size = 10

	page = max(1, page)
	page_size = max(1, min(page_size, 100))

	submissions_qs = TestSubmission.objects.all()

	if query:
		search_q = Q(participant_nom__icontains=query) | Q(participant_prenom__icontains=query)
		if query.isdigit():
			search_q |= Q(id=int(query))
		submissions_qs = submissions_qs.filter(search_q)

	if date_from:
		submissions_qs = submissions_qs.filter(participant_date__gte=date_from)
	if date_to:
		submissions_qs = submissions_qs.filter(participant_date__lte=date_to)
	if score_min is not None:
		submissions_qs = submissions_qs.filter(score20__gte=score_min)
	if score_max is not None:
		submissions_qs = submissions_qs.filter(score20__lte=score_max)
	if status_filter in {"to_review", "in_progress", "validated"}:
		submissions_qs = submissions_qs.filter(pdf_payload__workflow__status=status_filter)
	if test_type_filter in {"test-accueil", "stagiaire", "technicien", "service-administratif"}:
		submissions_qs = submissions_qs.filter(pdf_payload__testType=test_type_filter)

	if sort_by == "score-desc":
		submissions_qs = submissions_qs.order_by(F("score20").desc(nulls_last=True), "-created_at")
	elif sort_by == "score-asc":
		submissions_qs = submissions_qs.order_by(F("score20").asc(nulls_last=True), "-created_at")
	elif sort_by == "date-desc":
		submissions_qs = submissions_qs.order_by(F("participant_date").desc(nulls_last=True), "-created_at")
	elif sort_by == "date-asc":
		submissions_qs = submissions_qs.order_by(F("participant_date").asc(nulls_last=True), "-created_at")
	else:
		submissions_qs = submissions_qs.order_by("-created_at")

	total_count = submissions_qs.count()
	total_pages = max(1, math.ceil(total_count / page_size))
	page = min(page, total_pages)
	offset = (page - 1) * page_size

	submissions = submissions_qs.values(
		"id",
		"participant_nom",
		"participant_prenom",
		"participant_date",
		"score20",
		"pdf_payload",
		"created_at",
	)[offset:offset + page_size]
	items = [
		{
			"id": item["id"],
			"nom": item["participant_nom"],
			"prénom": item["participant_prenom"],
			"date": item["participant_date"].isoformat() if item["participant_date"] else None,
			"score20": item["score20"],
			"testType": _extract_test_type(item.get("pdf_payload") or {}),
			"workflowStatus": (
				(item.get("pdf_payload") or {}).get("workflow", {}).get("status")
				if isinstance((item.get("pdf_payload") or {}).get("workflow"), dict)
				and (item.get("pdf_payload") or {}).get("workflow", {}).get("status") in {"to_review", "in_progress", "validated"}
				else "to_review"
			),
			"validatedAt": (
				(item.get("pdf_payload") or {}).get("workflow", {}).get("validatedAt")
				if isinstance((item.get("pdf_payload") or {}).get("workflow"), dict)
				else None
			),
			"validatedBy": (
				(item.get("pdf_payload") or {}).get("workflow", {}).get("validatedBy")
				if isinstance((item.get("pdf_payload") or {}).get("workflow"), dict)
				else None
			),
			"isValidated": (
				(item.get("pdf_payload") or {}).get("result", {}).get("validé")
				if isinstance((item.get("pdf_payload") or {}).get("result"), dict)
				and isinstance((item.get("pdf_payload") or {}).get("result", {}).get("validé"), bool)
				else (item["score20"] is not None and item["score20"] >= 10)
			),
			"createdAt": item["created_at"].isoformat(),
		}
		for item in submissions
	]
	return Response(
		{
			"results": items,
			"count": total_count,
			"page": page,
			"page_size": page_size,
			"total_pages": total_pages,
		}
	)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def test_submission_detail(request, submission_id):
	try:
		submission = TestSubmission.objects.get(id=submission_id)
	except TestSubmission.DoesNotExist:
		return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

	if request.method == "GET":
		return Response(
			{
				"id": submission.id,
				"nom": submission.participant_nom,
				"prénom": submission.participant_prenom,
				"date": submission.participant_date.isoformat() if submission.participant_date else None,
				"score20": submission.score20,
				"testType": _extract_test_type(submission.pdf_payload or {}),
				"stats": submission.stats,
				"qcmResults": submission.qcm_results,
				"freeResults": submission.free_results,
				"pdfPayload": submission.pdf_payload,
				"workflowStatus": (
					(submission.pdf_payload or {}).get("workflow", {}).get("status")
					if isinstance((submission.pdf_payload or {}).get("workflow"), dict)
					and (submission.pdf_payload or {}).get("workflow", {}).get("status") in {"to_review", "in_progress", "validated"}
					else "to_review"
				),
				"validatedAt": (
					(submission.pdf_payload or {}).get("workflow", {}).get("validatedAt")
					if isinstance((submission.pdf_payload or {}).get("workflow"), dict)
					else None
				),
				"validatedBy": (
					(submission.pdf_payload or {}).get("workflow", {}).get("validatedBy")
					if isinstance((submission.pdf_payload or {}).get("workflow"), dict)
					else None
				),
				"createdAt": submission.created_at.isoformat(),
			}
		)

	data = request.data or {}
	payload = submission.pdf_payload or {}
	if "signatures" in data:
		existing = payload.get("signatures") if isinstance(payload.get("signatures"), dict) else {}
		incoming = data.get("signatures") if isinstance(data.get("signatures"), dict) else {}
		payload["signatures"] = {**existing, **incoming}
	if "observations" in data:
		existing = payload.get("observations") if isinstance(payload.get("observations"), dict) else {}
		incoming = data.get("observations") if isinstance(data.get("observations"), dict) else {}
		payload["observations"] = {**existing, **incoming}
	if "result" in data:
		existing = payload.get("result") if isinstance(payload.get("result"), dict) else {}
		incoming = data.get("result") if isinstance(data.get("result"), dict) else {}
		payload["result"] = {**existing, **incoming}
	if "participant" in data:
		existing = payload.get("participant") if isinstance(payload.get("participant"), dict) else {}
		incoming = data.get("participant") if isinstance(data.get("participant"), dict) else {}
		payload["participant"] = {**existing, **incoming}
	if "workflow" in data:
		existing = payload.get("workflow") if isinstance(payload.get("workflow"), dict) else {}
		incoming = data.get("workflow") if isinstance(data.get("workflow"), dict) else {}
		merged = {**existing, **incoming}
		status_value = merged.get("status")
		if status_value not in {"to_review", "in_progress", "validated"}:
			status_value = "to_review"
		merged["status"] = status_value

		if status_value == "validated":
			signatures = payload.get("signatures") if isinstance(payload.get("signatures"), dict) else {}
			animateur_signature = (signatures.get("animateur") or "").strip()
			if not animateur_signature:
				return Response(
					{"error": "Signature animateur requise pour cloturer le workflow."},
					status=status.HTTP_400_BAD_REQUEST,
				)
			if not merged.get("validatedAt"):
				merged["validatedAt"] = timezone.now().isoformat()
			if not merged.get("validatedBy"):
				merged["validatedBy"] = request.user.username
		else:
			merged["validatedAt"] = None
			merged["validatedBy"] = None

		payload["workflow"] = merged
	if "pdfPayload" in data:
		payload = data.get("pdfPayload") or payload

	submission.pdf_payload = payload
	submission.save(update_fields=["pdf_payload", "updated_at"])

	return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def test_submission_pdf(request, submission_id):
	try:
		submission = TestSubmission.objects.get(id=submission_id)
	except TestSubmission.DoesNotExist:
		return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

	preview_mode = request.query_params.get("preview") == "1"

	response = HttpResponse(content_type="application/pdf")
	if preview_mode:
		response["Content-Disposition"] = "inline; filename=\"test_accueil_sse_preview.pdf\""
		response["Cache-Control"] = "private, max-age=60"
	else:
		response["Content-Disposition"] = "attachment; filename=\"test_accueil_sse.pdf\""

	render_payload = submission.pdf_payload or {}
	if not isinstance(render_payload.get("questionnaire"), list):
		derived_questionnaire = _build_questionnaire_from_results(submission.qcm_results, submission.free_results)
		if derived_questionnaire:
			render_payload = {**render_payload, "questionnaire": derived_questionnaire}

	pdf = canvas.Canvas(response, pagesize=A4, pageCompression=1)
	_render_pdf(pdf, render_payload)
	pdf.showPage()
	pdf.save()

	return response
