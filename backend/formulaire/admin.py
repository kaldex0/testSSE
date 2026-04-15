from django.contrib import admin

from .models import TestSubmission


@admin.register(TestSubmission)
class TestSubmissionAdmin(admin.ModelAdmin):
	list_display = ("id", "participant_nom", "participant_prenom", "participant_date", "score20", "created_at")
	search_fields = ("participant_nom", "participant_prenom")
	list_filter = ("participant_date", "created_at")
