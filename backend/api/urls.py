from django.urls import path

from .views import AnalyzeView, HealthView

urlpatterns = [
    path("health/", HealthView.as_view()),
    path("routes/analyze/", AnalyzeView.as_view()),
]
