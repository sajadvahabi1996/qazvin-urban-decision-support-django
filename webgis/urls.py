from django.urls import path

from . import views

app_name = "webgis"

urlpatterns = [
    path("", views.index, name="index"),
    path("health/", views.health, name="health"),
    path("api/data/<slug:dataset_name>/", views.dataset, name="data"),
    path("api/export/excel/", views.export_excel, name="export_excel"),
]
