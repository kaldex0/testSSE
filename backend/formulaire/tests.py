from datetime import date

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import TestSubmission


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
