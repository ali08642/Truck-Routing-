import pytest

from routing_core.risk import (
    Risk,
    apply_load_rules,
    assess_weather,
    classify_rain,
    classify_snow,
    classify_wind,
)


@pytest.mark.parametrize(
    "mph, expected",
    [
        (0, Risk.LOW),
        (24.9, Risk.LOW),
        (25, Risk.MODERATE),
        (34, Risk.MODERATE),
        (35, Risk.HIGH),
        (44, Risk.HIGH),
        (45, Risk.SEVERE),
        (54, Risk.SEVERE),
        (55, Risk.NO_TRAVEL),
        (80, Risk.NO_TRAVEL),
    ],
)
def test_wind_bands(mph, expected):
    assert classify_wind(mph) == expected


@pytest.mark.parametrize(
    "rate, expected",
    [
        (0.0, Risk.LOW),
        (0.09, Risk.LOW),
        (0.10, Risk.MODERATE),
        (0.25, Risk.MODERATE),
        (0.26, Risk.HIGH),
        (0.50, Risk.HIGH),
        (0.51, Risk.SEVERE),
        (1.00, Risk.SEVERE),
        (1.01, Risk.NO_TRAVEL),
    ],
)
def test_rain_bands(rate, expected):
    assert classify_rain(rate) == expected


@pytest.mark.parametrize(
    "rate, expected",
    [
        (0.0, Risk.LOW),
        (0.49, Risk.LOW),
        (0.5, Risk.MODERATE),
        (1.0, Risk.MODERATE),
        (1.01, Risk.HIGH),
        (2.0, Risk.HIGH),
        (2.01, Risk.SEVERE),
        (3.0, Risk.SEVERE),
        (3.01, Risk.NO_TRAVEL),
    ],
)
def test_snow_bands(rate, expected):
    assert classify_snow(rate) == expected


# --- load rules -----------------------------------------------------------

def test_wind_55_is_no_travel_for_any_load():
    assert apply_load_rules(55, 0) == Risk.NO_TRAVEL
    assert apply_load_rules(60, 10_000) == Risk.NO_TRAVEL


def test_wind_45_54_heavy_load_is_no_travel():
    assert apply_load_rules(50, 30_001) == Risk.NO_TRAVEL


def test_wind_45_54_at_30000_is_not_overridden():
    # rule says ">30,000", so exactly 30,000 is allowed
    assert apply_load_rules(50, 30_000) == Risk.LOW
    assert assess_weather(50, 0, 0, 30_000).level == Risk.SEVERE  # wind alone


def test_wind_35_44_heavy_load_is_severe():
    assert apply_load_rules(40, 40_001) == Risk.SEVERE


def test_wind_35_44_at_40000_is_not_overridden():
    assert assess_weather(40, 0, 0, 40_000).level == Risk.HIGH


def test_load_rules_do_not_apply_below_35_mph():
    assert apply_load_rules(34, 80_000) == Risk.LOW


# --- combined assessment --------------------------------------------------

def test_worst_factor_wins():
    result = assess_weather(wind_mph=10, rain_in_hr=0.3, snow_in_hr=0.0, load_lb=20_000)
    assert result.level == Risk.HIGH
    assert result.driver == "rain"


def test_load_rule_raises_risk_above_weather_alone():
    light = assess_weather(40, 0, 0, 20_000)
    heavy = assess_weather(40, 0, 0, 45_000)
    assert light.level == Risk.HIGH
    assert heavy.level == Risk.SEVERE
    assert heavy.driver == "load"
    assert heavy.load_rule_applied and not light.load_rule_applied


def test_no_travel_from_any_single_factor():
    assert assess_weather(0, 1.5, 0, 0).level == Risk.NO_TRAVEL
    assert assess_weather(0, 0, 3.5, 0).level == Risk.NO_TRAVEL


def test_calm_weather_is_low():
    assert assess_weather(5, 0, 0, 80_000).level == Risk.LOW


def test_negative_input_rejected():
    with pytest.raises(ValueError):
        assess_weather(-1, 0, 0, 0)
