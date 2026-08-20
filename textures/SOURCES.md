# Texture sources

Public-domain equirectangular (simple cylindrical) global surface maps for the Orrery.
All files `<body>-2k.jpg` (2048x1024, JPEG quality 82) and `<body>-1k.jpg` (1024x512) are
resized from the originals listed below. Every source is a US government publication
(USGS Astrogeology or NASA); each USGS Astropedia product page states "public domain" in
its licence field. The original downloads are not kept in the repository; only the
resized JPEGs ship.

Latitude runs +90 (top) to -90 (bottom) in every file. Longitude layout is per body, below.

## Sun

- Product: STEREO+SDO composite map of the full solar surface, 304 Angstrom EUV, frame 0200 of "Around the Sun for 81 Days" (SVS 3851).
- Source: https://svs.gsfc.nasa.gov/3851/ , file https://svs.gsfc.nasa.gov/vis/a000000/a003800/a003851/solarSphere304A.0200.jpg
- Original: 1,735,897 bytes, 4096x2048 JPEG.
- Longitude convention: cylindrical equidistant; a snapshot of a rotating, evolving atmosphere. Features are representative only, longitudes not observational. Not visible-light photosphere: this is 304 Angstrom EUV (chromosphere/transition region), false colour orange. SVS notes the sequence is for visualisation, not scientific analysis.
- Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio.

## Mercury

- Product: MESSENGER MDIS Global Mosaic (May 2016), monochrome, rendered at 4096x2048 by the USGS Astrogeology WMS (layer `MESSENGER`, "Messenger Global Mosaic May2016", map `mercury_simp_cyl`).
- Source: https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mercury/mercury_simp_cyl.map&service=WMS&version=1.1.1&request=GetMap&layers=MESSENGER&styles=&srs=EPSG:4326&bbox=-180,-90,180,90&width=4096&height=2048&format=image/png
- Original: 9,554,552 bytes, 4096x2048 PNG (WMS render).
- Longitude convention: requested as EPSG:4326, prime meridian at centre, east positive. Caloris basin (30.5 N, 162.7 E) sits upper right, matching this layout.
- Note: the colour product (Mercury MESSENGER MDIS Global Color Mosaic 665m v3, https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_global_color_mosaic_665m , stated public domain, Positive East, domain -180 to 180) has no-data white areas at both poles and artefact rows near the south pole, so the complete monochrome basemap is used instead. Output is greyscale.
- Credit: NASA/Johns Hopkins University Applied Physics Laboratory/Carnegie Institution of Washington/USGS.

## Venus (surface radar, not clouds)

- Product: Venus Magellan Global C3-MDIR Synthetic Color Mosaic 4641m (colourised synthetic-aperture radar of the surface).
- Source page: https://astrogeology.usgs.gov/search/map/venus_magellan_global_c3_mdir_synthetic_color_mosaic_4641m ; file https://planetarymaps.usgs.gov/mosaic/Venus_Magellan_C3-MDIR_Colorized_Global_Mosaic_4641m.tif
- Original: 100,762,261 bytes, 8192x4096 GeoTIFF, 8-bit RGB.
- Longitude convention: page states Positive East, domain -180 to 180, so prime meridian at centre. The Maxwell Montes bright radar feature sits near top centre (65 N, ~3 E), matching this layout.
- Credit: NASA/JPL/USGS. Page licence: public domain.

## Earth

- Product: Blue Marble Next Generation with topography and bathymetry, July (world.topo.bathy.200407), 5400x2700.
- Source page: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry (formerly visibleearth.nasa.gov); file https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407.3x5400x2700.jpg
- Original: 2,308,798 bytes, 5400x2700 JPEG.
- Longitude convention: standard plate carree, Greenwich meridian at centre, east positive.
- Credit: NASA Earth Observatory, Blue Marble: Next Generation (MODIS/Terra; Reto Stockli, NASA Goddard Space Flight Center). The page states no explicit credit line; standard NASA imagery credit applies.

## Moon

- Product: CGI Moon Kit colour map (LRO LROC WAC), 4096x2048 16-bit sRGB TIFF (SVS 4720).
- Source: https://svs.gsfc.nasa.gov/4720 ; file https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_16bit_srgb_4k.tif
- Original: 61,891,324 bytes, 4096x2048 16-bit TIFF.
- Longitude convention: SVS states the map is centred on 0 longitude (near side centre), east positive. The Tycho ray crater (43.3 S, 11.4 W) sits left of centre in the lower half, matching this layout.
- Credit: NASA's Scientific Visualization Studio.

## Mars

- Product: Mars Viking MDIM2.1 Colorized Global Mosaic 232m, official reduced 1 km/px JPEG from the product page.
- Source page: https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m ; file https://astrogeology.usgs.gov/ckan/dataset/7131d503-cdc9-45a5-8f83-5126c0fd397e/resource/5ea881c6-01b3-41fa-a7af-42d2131b54f1/download/mars_viking_mdim21_clrmosaic_1km.jpg
- Original: 36,708,552 bytes, 21339x10670 JPEG.
- Longitude convention: page states Positive East, domain -180 to 180, prime meridian at centre. The Hellas basin bright patch (~70 E, 42 S) sits lower right of centre and the Syrtis Major dark region right of centre, matching this layout.
- Credit: NASA/JPL/USGS. Page licence: public domain.

## Jupiter

- Product: PIA07782, Cassini's Best Maps of Jupiter (Cylindrical Map), Cassini ISS, December 2000 flyby.
- Source page: https://science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map/ ; file https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia07/pia07782/PIA07782.tif
- Original: 19,456,427 bytes, 3601x1801 TIFF.
- Longitude convention: caption states planetocentric latitude and 360 degrees of longitude; the prime meridian position is not stated by the source. Gas giant: cloud features drift relative to System III, so the map is representative and longitudes are not observational. North is up: the Great Red Spot sits in the southern hemisphere.
- Credit: NASA/JPL/Space Science Institute.

## Saturn

- Product: Cassini ISS RGB Saturn Global Color Map (contrast enhanced), observation date 11 August 2011, from the NASA Planetary Data System bundle "Cassini ISS Global Maps of Jupiter and Saturn" (PDS Atmospheres Node).
- Source: https://atmos.nmsu.edu/data_and_services/atmospheres_data/Cassini/sat_global_map_11062023.html ; file https://atmos.nmsu.edu/PDS/data/PDS4/co_iss_global-maps/data_derived/Cassini_ISS_RGB_Saturn_global_color_map_contrast_enhance.fits
- Original: 77,829,120 bytes, FITS, 3601x1801x3 float32, converted to interleaved 8-bit RGB (linear min-max scale, no-data mapped to black); the orientation matches the official browse PNG (Browse_Cassini_ISS_RGB_Saturn_global_color_map_contrast_enhance.png).
- Longitude convention: FITS header states planetocentric latitude -90 to 90 and west longitude 360 (left edge) to 0 (right edge), so 180 W at centre, west positive. Gas giant: representative appearance, longitudes not observational. The map has narrow no-data black bands at the equator (ring obstruction) and at both poles; the 2011 Great White Spot storm band is visible near 35 N.
- Credit: NASA/JPL-Caltech/Space Science Institute. Data citation: Li, Liming (2023), Cassini ISS Global Maps of Jupiter and Saturn Bundle, NASA Planetary Data System, https://doi.org/10.17189/rkkb-6y30

## Saturn's rings: GAP

No public-domain ring texture with an alpha channel exists as a released NASA or USGS
product; photojournal, SVS and Astropedia list none. NASA has ring imagery and radial
brightness scans, but a texture with transparency would have to be newly derived from
them, so none was fabricated. Known ready-made ring textures with alpha are third-party
(not public domain) and are not used.

## Phobos

- Product: Phobos Viking Global Mosaic 5m (40 ppd, DLR control network), Viking Orbiter imagery.
- Source page: https://astrogeology.usgs.gov/search/map/phobos_viking_global_mosaic_5m ; file https://planetarymaps.usgs.gov/mosaic/Phobos_Viking_Mosaic_40ppd_DLRcontrol.tif
- Original: 103,738,243 bytes, 14400x7200 GeoTIFF, 8-bit greyscale.
- Longitude convention: page states Positive East, domain -180 to 180, prime meridian at centre. Stickney crater (~50 W) sits left of centre, matching this layout.
- Note: the sharper Phobos Mars Express SRC Global Mosaic 12m is not used: Mars Express is an ESA mission, so its imagery is not US government work even though the USGS page labels the product public domain. Output is greyscale.
- Credit: NASA/JPL/USGS. Page licence: public domain.

## Deimos: GAP

No public-domain equirectangular Deimos map is available. USGS serves a Deimos global
mosaic through its WMS (https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/mars/deimos_simp_cyl.map),
but its abstract credits the map to Philip Stooke (not a US government author) and its
public-domain status is not established, so it is not used. Astropedia, photojournal
and SVS list no equirectangular Deimos product.

## Io

- Product: Io Galileo SSI / Voyager Color Merged Global Mosaic 1km.
- Source page: https://astrogeology.usgs.gov/search/map/io_galileo_ssi_voyager_color_merged_global_mosaic_1km ; file https://planetarymaps.usgs.gov/mosaic/Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif
- Original: 196,637,696 bytes, 11445x5723 GeoTIFF, 8-bit RGB.
- Longitude convention: page states Positive West, domain -180 to 180. The Pele ring (18.7 S, 255.3 W) sits at x fraction 0.79, so the raster reads as prime meridian at centre with east-positive longitude increasing to the right (equivalently west longitude +180 at the left edge decreasing rightwards).
- Credit: NASA/JPL/USGS. Page licence: public domain.

## Europa

- Product: Europa Voyager - Galileo SSI Global Mosaic 500m (greyscale; USGS and NASA sites publish no public-domain colour global mosaic of Europa).
- Source page: https://astrogeology.usgs.gov/search/map/europa_voyager_galileo_ssi_global_mosaic_500m ; file https://planetarymaps.usgs.gov/mosaic/Europa_Voyager_GalileoSSI_global_mosaic_500m.tif
- Original: 192,777,263 bytes, 19631x9816 GeoTIFF, 8-bit greyscale.
- Longitude convention: page states Positive West, domain 0 to 360. Pwyll crater (25.2 S, 271.4 W) and the dark trailing-hemisphere mottled terrain place the raster as 360 W at the left edge decreasing to 0 W at the right (prime meridian at the right edge, 180 W at centre).
- Credit: NASA/JPL/USGS. Page licence: public domain.

## Ganymede

- Product: Ganymede Voyager - Galileo SSI Color Global Mosaic 1.4km.
- Source page: https://astrogeology.usgs.gov/search/map/ganymede_voyager_galileo_ssi_color_global_mosaic_1_4km ; file https://planetarymaps.usgs.gov/mosaic/Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif
- Original: 199,204,541 bytes, 11520x5760 GeoTIFF, 8-bit RGB.
- Longitude convention: page states Positive West, domain 0 to 360; same layout as Europa (360 W left edge to 0 W right edge, 180 W at centre). The Osiris bright ray crater (39 S, 166 W) sits near centre in the lower half, matching this layout.
- Credit: NASA/JPL/USGS. Page licence: public domain.

## Callisto

- Product: Callisto Galileo/Voyager Global Mosaic 1km (greyscale).
- Source page: https://astrogeology.usgs.gov/search/map/callisto_galileo_voyager_global_mosaic_1km ; file https://planetarymaps.usgs.gov/mosaic/Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif
- Original: 114,640,717 bytes, 15138x7569 GeoTIFF, 8-bit greyscale.
- Longitude convention: page states Positive West, domain 0 to 360; same layout as Europa. The Valhalla multi-ring structure (14.7 N, 55.4 W) sits at x fraction ~0.84, matching this layout.
- Credit: NASA/JPL/USGS. Page licence: public domain.

## Titan

- Product: Titan Cassini ISS Global Mosaic 4005m (PIA19658 map; near-infrared surface imaging through atmospheric methane windows, greyscale).
- Source page: https://astrogeology.usgs.gov/search/map/titan_cassini_iss_global_mosaic_4005m ; file https://planetarymaps.usgs.gov/mosaic/Titan_ISS_P19658_Mosaic_Global_4km.tif
- Original: 8,169,529 bytes, 4040x2020 GeoTIFF, 8-bit greyscale.
- Longitude convention: page states Positive West, domain 0 to 360; same layout as Europa. The Xanadu bright region (~100 W, equatorial) sits right of centre, matching this layout. This is the surface seen through the haze, not Titan's orange cloud deck.
- Credit: NASA/JPL-Caltech/Space Science Institute/USGS. Page licence: public domain.

## Triton

- Product: Triton Voyager 2 Global Color Mosaic 600m.
- Source page: https://astrogeology.usgs.gov/search/map/triton_voyager_2_global_color_mosaic_600m ; file https://planetarymaps.usgs.gov/mosaic/Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif
- Original: 299,994,887 bytes, 14138x7069 GeoTIFF, 8-bit RGB.
- Longitude convention: page states Positive East, domain -180 to 180, prime meridian at centre. Voyager 2 saw only part of Triton: high northern latitudes are black no-data in the official product and therefore in these textures.
- Credit: NASA/JPL/USGS. Page licence: public domain.

## Uranus: GAP

No public-domain equirectangular global map of Uranus exists on USGS Astrogeology, NASA
photojournal or NASA SVS. Voyager 2 images show an almost featureless disc and no
official cylindrical map product was released. Known texture maps in circulation are
third-party composites (not public domain) and are not used.

## Neptune: GAP

No public-domain equirectangular global map of Neptune exists on USGS Astrogeology, NASA
photojournal or NASA SVS. Voyager 2 full-disc images exist but no official cylindrical
map product was released. Known texture maps in circulation are third-party
reconstructions (not public domain) and are not used.
