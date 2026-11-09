"""Weather risk classification for a single checkpoint.

Pure Python, no Django and no network calls, so it is easy to test.

Boundary decisions (the spec table leaves these ambiguous):
  * Wind uses lower-inclusive bands:  <25 | 25-<35 | 35-<45 | 45-<55 | >=55
  * Rain/snow use upper-inclusive bands, matching the spec's ">1.00" and
    ">3.0" No Travel wording:
        rain: <0.10 | 0.10-0.25 | >0.25-0.50 | >0.50-1.00 | >1.00
        snow: <0.5  | 0.5-1.0   | >1.0-2.0   | >2.0-3.0   | >3.0
"""

from dataclasses import dataclass
from enum import IntEnum


class Risk(IntEnum):
    """Ordered so we can compare levels and take max()."""

    LOW = 0
    MODERATE = 1
    HIGH = 2
    SEVERE = 3
    NO_TRAVEL = 4

    @property
    def label(self) -> str:
        return self.name.replace("_", " ").title()


def classify_wind(mph: float) -> Risk:
    if mph < 25:
        return Risk.LOW
    if mph < 35:
        return Risk.MODERATE
    if mph < 45:
        return Risk.HIGH
    if mph < 55:
        return Risk.SEVERE
    return Risk.NO_TRAVEL


def classify_rain(inches_per_hour: float) -> Risk:
    if inches_per_hour < 0.10:
        return Risk.LOW
    if inches_per_hour <= 0.25:
        return Risk.MODERATE
    if inches_per_hour <= 0.50:
        return Risk.HIGH
    if inches_per_hour <= 1.00:
        return Risk.SEVERE
    return Risk.NO_TRAVEL


def classify_snow(inches_per_hour: float) -> Risk:
    if inches_per_hour < 0.5:
        return Risk.LOW
    if inches_per_hour <= 1.0:
        return Risk.MODERATE
    if inches_per_hour <= 2.0:
        return Risk.HIGH
    if inches_per_hour <= 3.0:
        return Risk.SEVERE
    return Risk.NO_TRAVEL


def apply_load_rules(wind_mph: float, load_lb: float) -> Risk:
    """Minimum risk forced by the load rules (LOW means no override)."""
    if wind_mph >= 55:
        return Risk.NO_TRAVEL  # any load
    if 45 <= wind_mph < 55 and load_lb > 30_000:
        return Risk.NO_TRAVEL
    if 35 <= wind_mph < 45 and load_lb > 40_000:
        return Risk.SEVERE
    return Risk.LOW


@dataclass(frozen=True)
class WeatherAssessment:
    level: Risk  # final risk for the checkpoint
    wind: Risk
    rain: Risk
    snow: Risk
    load_override: Risk  # what the load rules alone would force
    driver: str  # which factor decided the final level

    @property
    def load_rule_applied(self) -> bool:
        """True when the load rules made the result worse than weather alone."""
        return self.load_override > max(self.wind, self.rain, self.snow)


def assess_weather(
    wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float
) -> WeatherAssessment:
    """Final risk = worst of wind, rain, snow, and the load-rule override."""
    for name, value in (
        ("wind_mph", wind_mph),
        ("rain_in_hr", rain_in_hr),
        ("snow_in_hr", snow_in_hr),
        ("load_lb", load_lb),
    ):
        if value < 0:
            raise ValueError(f"{name} cannot be negative (got {value})")

    wind = classify_wind(wind_mph)
    rain = classify_rain(rain_in_hr)
    snow = classify_snow(snow_in_hr)
    load = apply_load_rules(wind_mph, load_lb)

    level = max(wind, rain, snow, load)

    if load > max(wind, rain, snow):
        driver = "load"
    else:
        driver = max(
            (("wind", wind), ("rain", rain), ("snow", snow)), key=lambda x: x[1]
        )[0]

    return WeatherAssessment(level, wind, rain, snow, load, driver)
