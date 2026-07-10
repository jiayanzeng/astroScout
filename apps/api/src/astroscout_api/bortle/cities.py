"""Curated seed of major world metros (name, lat, lon, population).

This is the light-source seed used by the fallback Bortle model. It is a
deliberately small, reviewable subset of the world's largest light domes — enough
to estimate sky brightness near populated areas when rebuilding the fallback grid.
It is NOT measured data; the committed production grid is derived from World Atlas
2015, and model.py carries the honest framing.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class City:
    name: str
    lat: float
    lon: float
    population: int


CITIES: tuple[City, ...] = (
    # North America
    City("New York", 40.71, -74.01, 18_800_000),
    City("Los Angeles", 34.05, -118.24, 12_500_000),
    City("Chicago", 41.88, -87.63, 8_900_000),
    City("Toronto", 43.65, -79.38, 6_200_000),
    City("Mexico City", 19.43, -99.13, 21_800_000),
    City("Houston", 29.76, -95.37, 7_100_000),
    City("Dallas", 32.78, -96.80, 7_600_000),
    City("Miami", 25.76, -80.19, 6_200_000),
    City("Washington", 38.91, -77.04, 6_300_000),
    City("Philadelphia", 39.95, -75.17, 6_200_000),
    City("Atlanta", 33.75, -84.39, 6_100_000),
    City("Boston", 42.36, -71.06, 4_900_000),
    City("San Francisco", 37.77, -122.42, 4_700_000),
    City("Phoenix", 33.45, -112.07, 4_900_000),
    City("Seattle", 47.61, -122.33, 4_000_000),
    City("Montreal", 45.50, -73.57, 4_300_000),
    City("Las Vegas", 36.17, -115.14, 2_300_000),
    # South America
    City("Sao Paulo", -23.55, -46.63, 22_400_000),
    City("Buenos Aires", -34.60, -58.38, 15_400_000),
    City("Rio de Janeiro", -22.91, -43.17, 13_500_000),
    City("Lima", -12.05, -77.04, 11_000_000),
    City("Bogota", 4.71, -74.07, 11_300_000),
    City("Santiago", -33.45, -70.67, 6_800_000),
    # Europe
    City("London", 51.51, -0.13, 14_300_000),
    City("Paris", 48.85, 2.35, 11_100_000),
    City("Madrid", 40.42, -3.70, 6_700_000),
    City("Barcelona", 41.39, 2.17, 5_600_000),
    City("Berlin", 52.52, 13.40, 4_500_000),
    City("Rome", 41.90, 12.50, 4_300_000),
    City("Milan", 45.46, 9.19, 5_200_000),
    City("Moscow", 55.76, 37.62, 17_000_000),
    City("Saint Petersburg", 59.93, 30.34, 5_400_000),
    City("Istanbul", 41.01, 28.98, 15_600_000),
    City("Amsterdam", 52.37, 4.90, 2_500_000),
    City("Athens", 37.98, 23.73, 3_200_000),
    City("Vienna", 48.21, 16.37, 2_800_000),
    City("Warsaw", 52.23, 21.01, 3_100_000),
    City("Kyiv", 50.45, 30.52, 3_000_000),
    City("Munich", 48.14, 11.58, 2_600_000),
    City("Manchester", 53.48, -2.24, 2_800_000),
    # Africa
    City("Cairo", 30.04, 31.24, 21_300_000),
    City("Lagos", 6.52, 3.38, 15_400_000),
    City("Kinshasa", -4.32, 15.31, 15_600_000),
    City("Johannesburg", -26.20, 28.05, 6_000_000),
    City("Nairobi", -1.29, 36.82, 5_100_000),
    City("Casablanca", 33.57, -7.59, 3_700_000),
    City("Cape Town", -33.92, 18.42, 4_700_000),
    City("Addis Ababa", 9.03, 38.74, 5_200_000),
    # Middle East
    City("Tehran", 35.69, 51.39, 9_500_000),
    City("Baghdad", 33.31, 44.36, 7_500_000),
    City("Riyadh", 24.71, 46.68, 7_700_000),
    City("Dubai", 25.20, 55.27, 3_500_000),
    City("Tel Aviv", 32.08, 34.78, 4_200_000),
    # South & Southeast Asia
    City("Delhi", 28.61, 77.21, 32_900_000),
    City("Mumbai", 19.08, 72.88, 21_300_000),
    City("Kolkata", 22.57, 88.36, 15_100_000),
    City("Chennai", 13.08, 80.27, 11_500_000),
    City("Bangalore", 12.97, 77.59, 13_200_000),
    City("Hyderabad", 17.39, 78.49, 10_500_000),
    City("Karachi", 24.86, 67.00, 16_800_000),
    City("Dhaka", 23.81, 90.41, 23_200_000),
    City("Bangkok", 13.76, 100.50, 10_700_000),
    City("Jakarta", -6.21, 106.85, 33_400_000),
    City("Manila", 14.60, 120.98, 13_900_000),
    City("Ho Chi Minh City", 10.82, 106.63, 9_000_000),
    City("Kuala Lumpur", 3.14, 101.69, 8_000_000),
    City("Singapore", 1.35, 103.82, 5_900_000),
    # East Asia
    City("Beijing", 39.90, 116.41, 21_500_000),
    City("Shanghai", 31.23, 121.47, 28_500_000),
    City("Guangzhou", 23.13, 113.26, 19_000_000),
    City("Shenzhen", 22.54, 114.06, 17_500_000),
    City("Chengdu", 30.57, 104.07, 16_000_000),
    City("Tokyo", 35.68, 139.69, 37_400_000),
    City("Osaka", 34.69, 135.50, 19_000_000),
    City("Seoul", 37.57, 126.98, 25_000_000),
    City("Hong Kong", 22.32, 114.17, 7_500_000),
    City("Taipei", 25.03, 121.57, 7_000_000),
    # Oceania
    City("Sydney", -33.87, 151.21, 5_300_000),
    City("Melbourne", -37.81, 144.96, 5_100_000),
    City("Brisbane", -27.47, 153.03, 2_600_000),
    City("Perth", -31.95, 115.86, 2_100_000),
    City("Auckland", -36.85, 174.76, 1_700_000),
)
