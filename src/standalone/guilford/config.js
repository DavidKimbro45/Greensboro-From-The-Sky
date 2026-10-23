export const COUNTY = Object.freeze({
  lat: 36.08,
  lon: -79.79,
  west: -80.05,
  south: 35.89,
  east: -79.52,
  north: 36.26,
});
export const DESTINATIONS = Object.freeze([
  { name: 'Guilford County', lat: 36.08, lon: -79.79, height: 85000 },
  { name: 'Downtown Greensboro', lat: 36.0726, lon: -79.792, height: 6500 },
  { name: 'High Point', lat: 35.9557, lon: -80.0053, height: 8500 },
  { name: 'PTI Airport', lat: 36.0978, lon: -79.9373, height: 12000 },
  { name: 'Summerfield', lat: 36.2087, lon: -79.9048, height: 10000 },
  { name: 'Oak Ridge', lat: 36.1735, lon: -79.9889, height: 10000 },
  { name: 'Jamestown', lat: 35.9943, lon: -79.9353, height: 6500 },
  { name: 'Gibsonville', lat: 36.1057, lon: -79.5422, height: 8500 },
  { name: 'Pleasant Garden', lat: 35.9621, lon: -79.7622, height: 8500 },
  { name: 'Stokesdale', lat: 36.2371, lon: -79.9795, height: 8500 },
]);
const base = 'https://gcgis.guilfordcountync.gov/arcgis/rest/services/GISDV';
export const GIS_LAYERS = Object.freeze(
  [
    {
      id: 'parcels',
      name: 'Parcel boundaries',
      service: 'Parcels',
      layers: '0',
      note: 'Reference · zoom in to street scale',
    },
    {
      id: 'zoning',
      name: 'Zoning districts',
      service: 'Zoning',
      layers: '0',
      note: 'Reference · jurisdiction coverage varies',
    },
    {
      id: 'schools',
      name: 'Schools & universities',
      service: 'Education',
      layers: '0,1,2,3,4',
      note: 'Reference · county education locations',
    },
    {
      id: 'medical',
      name: 'Hospitals',
      service: 'Points_of_Interest',
      layers: '8',
      note: 'Reference · locations, no capacity data',
    },
    {
      id: 'parks',
      name: 'Parks, trails & greenways',
      service: 'Points_of_Interest',
      layers: '10,11,12',
      note: 'Reference · county recreation GIS',
    },
    {
      id: 'flood',
      name: 'Effective flood zones',
      service: 'Watershed_Management',
      layers: '12',
      note: 'Reference · effective June 10, 2026; not live flooding',
    },
    {
      id: 'dams',
      name: 'Dams & classified waterways',
      service: 'Watershed_Management',
      layers: '1,2',
      note: 'Reference · no operating status',
    },
    {
      id: 'wetlands',
      name: 'Wetlands inventory',
      service: 'Wetlands_Inventory',
      layers: '0',
      note: 'Reference · mapped inventory',
    },
    {
      id: 'municipalities',
      name: 'City limits',
      service: 'City_Limit_Boundaries',
      layers: '0',
      note: 'Reference · municipal boundaries',
    },
    {
      id: 'government',
      name: 'County buildings & property',
      service: 'County_Properties',
      layers: '1,2',
      note: 'Reference · county-owned assets',
    },
    {
      id: 'contours',
      name: 'Elevation contours',
      service: 'Elevation',
      layers: '1',
      note: 'Reference · 10-foot contours; zoom in',
    },
    {
      id: 'historic',
      name: 'Historic landmarks',
      service: 'Historic_Bldgs_Landmark',
      layers: '0',
      note: 'Reference · county landmark inventory',
    },
  ].map((layer) =>
    Object.freeze({ ...layer, url: `${base}/${layer.service}/MapServer` }),
  ),
);
export function activeTraffic(features, at = Date.now()) {
  return features.filter(({ properties: p = {} }) => {
    const start = p.StartDateTime == null ? null : Number(p.StartDateTime);
    const end = p.EndDateTime == null ? null : Number(p.EndDateTime);
    return (start === null || start <= at) && (end === null || end >= at);
  });
}
export function futureTraffic(features, at = Date.now()) {
  return features.filter(
    ({ properties: p = {} }) =>
      p.StartDateTime != null &&
      Number(p.StartDateTime) > at &&
      (p.EndDateTime == null || Number(p.EndDateTime) >= at),
  );
}
export function safeWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
