from shapely.geometry import box

from app.pipeline.sources.worldcover import tile_names


def test_tile_names():
    # Oeiras lies in the tile whose lower-left corner is 36°N 12°W (same file as the thesis)
    assert tile_names(box(-9.33, 38.67, -9.21, 38.75)) == [
        "ESA_WorldCover_10m_2021_v200_N36W012_Map.tif"
    ]
    # Region crossing a tile edge and the equator / prime meridian
    names = tile_names(box(-0.5, -0.5, 0.5, 0.5))
    assert len(names) == 4
    assert "ESA_WorldCover_10m_2021_v200_S03W003_Map.tif" in names
    assert "ESA_WorldCover_10m_2021_v200_N00E000_Map.tif" in names
