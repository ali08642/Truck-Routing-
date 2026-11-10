from django.urls import path

from .heatmap_api import HeatmapView
from .views import AnalyzeView, HealthView

urlpatterns = [
    path("health/", HealthView.as_view()),
    path("routes/analyze/", AnalyzeView.as_view()),
    path("weather/heatmap/", HeatmapView.as_view()),
]
