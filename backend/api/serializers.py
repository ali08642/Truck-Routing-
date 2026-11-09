from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

MAX_LOAD_LB = 120_000  # well above the 80,000 lb US legal limit, to allow permits


class AnalyzeRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200)
    destination = serializers.CharField(max_length=200)
    departure_time = serializers.DateTimeField()
    load_lb = serializers.IntegerField(min_value=0, max_value=MAX_LOAD_LB)

    def validate_departure_time(self, value):
        now = timezone.now()
        if value < now - timedelta(hours=1):  # 1h grace: forecasts are hourly
            raise serializers.ValidationError("Departure time is in the past.")
        days = settings.MAX_DEPARTURE_DAYS_AHEAD
        if value > now + timedelta(days=days):
            raise serializers.ValidationError(
                f"Forecasts only reach about {days} days ahead. Choose an earlier departure."
            )
        return value

    def validate(self, data):
        if data["origin"].strip().lower() == data["destination"].strip().lower():
            raise serializers.ValidationError("Origin and destination must be different.")
        return data
