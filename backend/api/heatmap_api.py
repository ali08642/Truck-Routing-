"""Serializer and view for POST /api/weather/heatmap/."""

from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import MAX_LOAD_LB, AnalyzeRequestSerializer
from .services.heatmap import MAX_HOURS, build_heatmap
from .services.providers import get_providers
from .services.providers.base import ProviderError


class PointSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)


class HeatmapRequestSerializer(serializers.Serializer):
    origin = PointSerializer()
    destination = PointSerializer()
    departure_time = serializers.DateTimeField()
    load_lb = serializers.IntegerField(min_value=0, max_value=MAX_LOAD_LB)
    hours = serializers.IntegerField(min_value=1, max_value=MAX_HOURS, default=MAX_HOURS)

    # Same departure-window rule as the analyze endpoint, without duplicating it.
    validate_departure_time = AnalyzeRequestSerializer.validate_departure_time


class HeatmapView(APIView):
    def post(self, request):
        serializer = HeatmapRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        try:
            result = build_heatmap(
                origin=(d["origin"]["lat"], d["origin"]["lon"]),
                destination=(d["destination"]["lat"], d["destination"]["lon"]),
                departure=d["departure_time"],
                load_lb=d["load_lb"],
                weather_provider=get_providers().weather,
                hours=d["hours"],
            )
        except ProviderError as exc:
            return Response({"detail": f"Upstream service problem: {exc}"}, status=502)
        return Response(result)
