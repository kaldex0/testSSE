from datetime import date
from io import BytesIO

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from reportlab.pdfgen import canvas

from .models import TestSubmission
from . import views


class ApiSmokeTests(APITestCase):
	def test_root_endpoint(self):
		response = self.client.get(reverse("api_root"))
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertIn("endpoints", response.data)

	def test_health_endpoint(self):
		response = self.client.get(reverse("api_health"))
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data.get("status"), "ok")


class SubmissionTests(APITestCase):
	def test_create_submission(self):
		payload = {
			"stats": {"score20": 12.5},
			"qcmResults": [],
			"freeResults": [],
			"pdfPayload": {
				"participant": {
					"nom": "Dupont",
					"prénom": "Alice",
					"date": "2026-04-13",
				},
				"answers": {},
				"result": {
					"score": "12.5",
					"validé": True,
					"renforcement": False,
					"correction": True,
				},
				"signatures": {"participant": "", "animateur": ""},
				"observations": {"animateur": ""},
			},
		}

		response = self.client.post(reverse("create_test_submission"), payload, format="json")
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertTrue(TestSubmission.objects.filter(id=response.data["id"]).exists())

	def test_create_submission_sets_default_workflow_and_validation(self):
		payload = {
			"stats": {"score20": 8.0},
			"qcmResults": [],
			"freeResults": [],
			"pdfPayload": {
				"participant": {
					"nom": "Martin",
					"prénom": "Jean",
					"date": "2026-04-13",
				},
				"result": {"score": "8", "validé": True},
				"workflow": {"status": "validated", "validatedBy": "x"},
				"answers": {
					"q2": "A" * 600,
					"q7": "B" * 600,
					"q9": "C" * 600,
				},
			},
		}

		response = self.client.post(reverse("create_test_submission"), payload, format="json")
		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		submission = TestSubmission.objects.get(id=response.data["id"])
		workflow = submission.pdf_payload.get("workflow", {})
		result = submission.pdf_payload.get("result", {})
		answers = submission.pdf_payload.get("answers", {})

		self.assertEqual(workflow.get("status"), "to_review")
		self.assertIsNone(workflow.get("validatedAt"))
		self.assertIsNone(workflow.get("validatedBy"))
		self.assertFalse(result.get("validé"))
		self.assertTrue(result.get("correction"))
		self.assertEqual(len(answers.get("q2")), views.FREE_TEXT_MAX_CHARS)
		self.assertEqual(len(answers.get("q7")), views.FREE_TEXT_MAX_CHARS)
		self.assertEqual(len(answers.get("q9")), views.PICTOGRAM_TEXT_MAX_CHARS * 4 + 24)

	def test_create_submission_missing_participant_returns_400(self):
		payload = {
			"stats": {"score20": 10},
			"pdfPayload": {"participant": {"nom": "", "prénom": ""}},
		}

		response = self.client.post(reverse("create_test_submission"), payload, format="json")
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ViewHelperTests(APITestCase):
	def test_helpers_extract_and_normalize(self):
		payload = {
			"participant": {"nom": "Dùpont", "prénom": "A-lice"},
			"testLabel": "Test Technicien",
			"questionnaire": [
				{"index": 1, "label": "Question 1", "answer": "Rep 1"},
				{"label": "Question 2", "answer": "Rep 2"},
			],
		}
		rows = views._extract_questionnaire_rows(payload, {})
		self.assertEqual(rows[0][0], "Q1. Question 1")
		self.assertEqual(rows[1][0], "Question 2")

		filename = views._build_candidate_pdf_filename(payload)
		self.assertEqual(filename, "DupontAliceTestTechnicien.pdf")
		self.assertEqual(views._extract_test_type({"testType": "technicien"}), "technicien")
		self.assertEqual(views._extract_test_type({"testType": "invalid"}), "test-accueil")
		self.assertEqual(views._yes_no(True), "Oui")
		self.assertEqual(views._yes_no(False), "Non")
		self.assertEqual(views._yes_no("yes"), "Oui")
		self.assertEqual(views._yes_no("no"), "Non")

	def test_questionnaire_builder_and_fallback(self):
		qcm_results = [
			{"id": "q1", "label": "QCM", "selected": "A"},
			{"id": "q2", "label": "QCM2", "selected": "B"},
		]
		free_results = [
			{"id": "f1", "label": "Libre", "answer": "Texte"},
			{"id": "f2", "label": "Picto", "pictograms": [{"answer": "P1"}, {"answer": "P2"}]},
		]
		built = views._build_questionnaire_from_results(qcm_results, free_results)
		self.assertEqual(len(built), 4)
		self.assertEqual(built[3]["answer"], "P1 | P2")

		fallback = views._extract_questionnaire_rows({}, {"q1": "A"})
		self.assertTrue(len(fallback) >= 14)

	def test_signature_helpers(self):
		self.assertTrue(views._is_data_url("data:image/png;base64,aaaa"))
		self.assertFalse(views._is_data_url("plain"))

		buffer = BytesIO()
		pdf = canvas.Canvas(buffer)
		self.assertFalse(views._draw_signature_image(pdf, "data:image/png;base64,broken", 10, 10))


class PdfEndpointTests(APITestCase):
	def test_generate_pdf_requires_post(self):
		response = self.client.get(reverse("generate_pdf"))
		self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

	def test_generate_pdf_invalid_json(self):
		response = self.client.post(
			reverse("generate_pdf"),
			data="not-json",
			content_type="application/json",
		)
		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

	def test_generate_pdf_success_and_filename(self):
		payload = {
			"participant": {"nom": "Durand", "prénom": "Lea", "date": "2026-05-01"},
			"answers": {"q1": "Rep"},
			"result": {"score": "12", "validé": True, "renforcement": False, "correction": True},
			"signatures": {"participant": "Nom", "animateur": "Formateur"},
			"observations": {"animateur": "RAS"},
			"testLabel": "Test Technicien",
		}
		response = self.client.post(reverse("generate_pdf"), payload, format="json")
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response["Content-Type"], "application/pdf")
		self.assertIn("DurandLeaTestTechnicien.pdf", response["Content-Disposition"])


class AdminWorkflowAndPdfTests(APITestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user(username="admin", password="testpass123")
		self.client.force_authenticate(self.user)
		self.submission = TestSubmission.objects.create(
			participant_nom="Nom",
			participant_prenom="Prenom",
			participant_date=date(2026, 4, 13),
			score20=12,
			stats={"score20": 12},
			qcm_results=[{"id": "q1", "label": "QCM Label", "selected": "A"}],
			free_results=[{"id": "f1", "label": "Libre Label", "answer": "Texte"}],
			pdf_payload={
				"testType": "technicien",
				"participant": {"nom": "Nom", "prénom": "Prenom"},
				"result": {"validé": False},
				"workflow": {"status": "to_review", "validatedAt": None, "validatedBy": None},
				"signatures": {"participant": "", "animateur": ""},
				"observations": {"animateur": ""},
			},
		)

	def test_admin_list_filters_and_pagination(self):
		TestSubmission.objects.create(
			participant_nom="Dupont",
			participant_prenom="Alice",
			participant_date=date(2026, 4, 14),
			score20=16,
			stats={"score20": 16},
			qcm_results=[],
			free_results=[],
			pdf_payload={"testType": "stagiaire", "workflow": {"status": "validated"}, "result": {"validé": True}},
		)

		response = self.client.get(
			reverse("list_test_submissions"),
			{
				"q": "Dupont",
				"status": "validated",
				"test_type": "stagiaire",
				"score_min": "15",
				"date_from": "2026-04-01",
				"sort": "score-desc",
				"page": "1",
				"page_size": "5",
			},
		)
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["count"], 1)
		self.assertEqual(response.data["results"][0]["testType"], "stagiaire")
		self.assertEqual(response.data["results"][0]["workflowStatus"], "validated")

	def test_admin_detail_get_and_patch_validation(self):
		url = reverse("test_submission_detail", args=[self.submission.id])

		get_response = self.client.get(url)
		self.assertEqual(get_response.status_code, status.HTTP_200_OK)
		self.assertEqual(get_response.data["testType"], "technicien")

		invalid_patch = self.client.patch(
			url,
			{"workflow": {"status": "validated"}},
			format="json",
		)
		self.assertEqual(invalid_patch.status_code, status.HTTP_400_BAD_REQUEST)

		ok_patch = self.client.patch(
			url,
			{
				"signatures": {"animateur": "Signature Admin"},
				"workflow": {"status": "validated"},
			},
			format="json",
		)
		self.assertEqual(ok_patch.status_code, status.HTTP_200_OK)
		self.submission.refresh_from_db()
		workflow = self.submission.pdf_payload.get("workflow", {})
		self.assertEqual(workflow.get("status"), "validated")
		self.assertEqual(workflow.get("validatedBy"), "admin")
		self.assertIsNotNone(workflow.get("validatedAt"))

	def test_admin_patch_invalid_status_resets_workflow(self):
		url = reverse("test_submission_detail", args=[self.submission.id])
		response = self.client.patch(
			url,
			{"workflow": {"status": "unknown", "validatedAt": "x", "validatedBy": "y"}},
			format="json",
		)
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.submission.refresh_from_db()
		workflow = self.submission.pdf_payload.get("workflow", {})
		self.assertEqual(workflow.get("status"), "to_review")
		self.assertIsNone(workflow.get("validatedAt"))
		self.assertIsNone(workflow.get("validatedBy"))

	def test_admin_pdf_generation_attachment_and_preview(self):
		url = reverse("test_submission_pdf", args=[self.submission.id])
		response = self.client.get(url)
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response["Content-Type"], "application/pdf")
		self.assertIn("NomPrenomTestTechnicien", response["Content-Disposition"])

		preview_response = self.client.get(url, {"preview": "1"})
		self.assertEqual(preview_response.status_code, status.HTTP_200_OK)
		self.assertIn("inline; filename=\"preview_", preview_response["Content-Disposition"])

	def test_admin_not_found_routes(self):
		detail = self.client.get(reverse("test_submission_detail", args=[99999]))
		self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

		pdf = self.client.get(reverse("test_submission_pdf", args=[99999]))
		self.assertEqual(pdf.status_code, status.HTTP_404_NOT_FOUND)


class AdminListPaginationTests(APITestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user(username="admin", password="testpass123")
		self.client.force_authenticate(self.user)

		for idx in range(15):
			TestSubmission.objects.create(
				participant_nom=f"Nom{idx}",
				participant_prenom=f"Prenom{idx}",
				participant_date=date(2026, 4, 13),
				score20=10 + (idx % 5),
				stats={"score20": 10 + (idx % 5)},
				qcm_results=[],
				free_results=[],
				pdf_payload={
					"result": {"validé": True},
					"workflow": {"status": "to_review"},
				},
			)

	def test_paginated_list_shape(self):
		response = self.client.get(reverse("list_test_submissions"), {"page": 1, "page_size": 10})
		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertIn("results", response.data)
		self.assertEqual(response.data["count"], 15)
		self.assertEqual(len(response.data["results"]), 10)
		self.assertEqual(response.data["total_pages"], 2)
