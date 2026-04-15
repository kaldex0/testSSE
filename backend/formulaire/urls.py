from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

urlpatterns = [
    path("", views.api_root, name="api_root"),
    path("api/health", views.api_health, name="api_health"),
    path("api/pdf", views.generate_pdf, name="generate_pdf"),
    path("api/tests", views.create_test_submission, name="create_test_submission"),
    path("api/admin/tests", views.list_test_submissions, name="list_test_submissions"),
    path("api/admin/tests/<int:submission_id>", views.test_submission_detail, name="test_submission_detail"),
    path("api/admin/tests/<int:submission_id>/pdf", views.test_submission_pdf, name="test_submission_pdf"),
    path("api/token", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh", TokenRefreshView.as_view(), name="token_refresh"),
]
