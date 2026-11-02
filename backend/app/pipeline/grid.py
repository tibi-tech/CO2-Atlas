"""Common analysis grid: every layer is resampled onto the same UTM grid."""

from dataclasses import dataclass

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.transform import Affine, from_origin
from rasterio.warp import reproject
from shapely import transform as shp_transform
from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry


@dataclass(frozen=True)
class Grid:
    crs: CRS
    transform: Affine
    width: int
    height: int

    @property
    def shape(self) -> tuple[int, int]:
        return self.height, self.width

    @property
    def pixel_area_m2(self) -> float:
        return abs(self.transform.a * self.transform.e)

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        left, top = self.transform.c, self.transform.f
        return (left, top + self.transform.e * self.height, left + self.transform.a * self.width,
                top)

    def profile(self, **extra) -> dict:
        p = {
            "driver": "GTiff", "crs": self.crs, "transform": self.transform,
            "width": self.width, "height": self.height, "count": 1,
            "dtype": "float32", "nodata": np.nan, "compress": "deflate",
        }
        p.update(extra)
        return p


def utm_crs_for(geom_wgs84: BaseGeometry) -> CRS:
    c = geom_wgs84.centroid
    zone = int((c.x + 180) // 6) + 1
    return CRS.from_epsg((32600 if c.y >= 0 else 32700) + zone)


def to_crs(geom: BaseGeometry, src: CRS | int, dst: CRS | int) -> BaseGeometry:
    t = Transformer.from_crs(src, dst, always_xy=True)
    return shp_transform(geom, lambda xy: np.column_stack(t.transform(xy[:, 0], xy[:, 1])))


def area_km2(geom_wgs84: BaseGeometry) -> float:
    return to_crs(geom_wgs84, 4326, utm_crs_for(geom_wgs84)).area / 1e6


def make_grid(geom_wgs84: BaseGeometry, resolution: float = 10.0) -> Grid:
    crs = utm_crs_for(geom_wgs84)
    minx, miny, maxx, maxy = to_crs(geom_wgs84, 4326, crs).bounds
    minx = np.floor(minx / resolution) * resolution
    maxy = np.ceil(maxy / resolution) * resolution
    width = int(np.ceil((maxx - minx) / resolution))
    height = int(np.ceil((maxy - miny) / resolution))
    return Grid(crs, from_origin(minx, maxy, resolution, resolution), width, height)


def region_mask(grid: Grid, geom_wgs84: BaseGeometry) -> np.ndarray:
    """True for pixels inside the region."""
    g = to_crs(geom_wgs84, 4326, grid.crs)
    return geometry_mask([mapping(g)], out_shape=grid.shape, transform=grid.transform,
                         invert=True, all_touched=False)


def warp(source: np.ndarray, src_transform: Affine, src_crs, grid: Grid,
         resampling: Resampling = Resampling.bilinear, src_nodata=None) -> np.ndarray:
    dst = np.full(grid.shape, np.nan, dtype=np.float32)
    reproject(
        source=source.astype(np.float32), destination=dst,
        src_transform=src_transform, src_crs=src_crs, src_nodata=src_nodata,
        dst_transform=grid.transform, dst_crs=grid.crs, dst_nodata=np.nan,
        resampling=resampling,
    )
    return dst


def read_to_grid(path, grid: Grid, band: int = 1,
                 resampling: Resampling = Resampling.bilinear) -> np.ndarray:
    with rasterio.open(path) as src:
        return warp(src.read(band), src.transform, src.crs, grid, resampling, src.nodata)


def write_raster(path, data: np.ndarray, grid: Grid, **extra) -> None:
    with rasterio.open(path, "w", **grid.profile(**extra)) as dst:
        dst.write(data.astype(extra.get("dtype", "float32")), 1)


def geometry_from_geojson(obj: dict) -> BaseGeometry:
    if obj.get("type") == "FeatureCollection":
        from shapely.ops import unary_union

        return unary_union([shape(f["geometry"]) for f in obj["features"]])
    if obj.get("type") == "Feature":
        return shape(obj["geometry"])
    return shape(obj)
