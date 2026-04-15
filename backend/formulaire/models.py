from django.db import models


class TestSubmission(models.Model):
	participant_nom = models.CharField(max_length=120)
	participant_prenom = models.CharField(max_length=120)
	participant_date = models.DateField(null=True, blank=True)
	score20 = models.FloatField(null=True, blank=True)
	stats = models.JSONField(default=dict)
	qcm_results = models.JSONField(default=list)
	free_results = models.JSONField(default=list)
	pdf_payload = models.JSONField(default=dict)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	def __str__(self):
		return f"{self.participant_nom} {self.participant_prenom} - {self.created_at:%Y-%m-%d}"
