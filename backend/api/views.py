from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import AnalyzeRequestSerializer
from .services.analysis import analyze_trip
from .services.providers import get_providers
from .services.providers.base import LocationNotFound, ProviderError, RouteNotFound


class HealthView(APIView):
    def get(self, request):
        return Response({"status": "ok"})


class AnalyzeView(APIView):
    def post(self, request):
        serializer = AnalyzeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            result = analyze_trip(
                origin=data["origin"],
                destination=data["destination"],
                departure=data["departure_time"],
                load_lb=data["load_lb"],
                providers=get_providers(),
            )
        except (LocationNotFound, RouteNotFound) as exc:
            return Response({"detail": str(exc)}, status=400)
        except ProviderError as exc:
            return Response({"detail": f"Upstream service problem: {exc}"}, status=502)

        return Response(result)
