require([
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/FeatureLayer",
  "esri/rest/support/Query"
], function(Map, MapView, FeatureLayer, Query) {

  // Base map
  const map = new Map({ basemap: "dark-gray-vector" });
  const view = new MapView({
    container: "viewDiv",
    map: map,
    center: [-97.323, 27.877], // Portland, TX
    zoom: 12
  });

  // Add a couple example layers (edit with your URLs)
  const shelters = new FeatureLayer({
    url: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/portland_eoc_inventory/FeatureServer/6",
    outFields: ["*"]
  });
  map.add(shelters);

  const roads = new FeatureLayer({
    url: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/portland_eoc_inventory/FeatureServer/5",
    outFields: ["*"]
  });
  map.add(roads);

  const equipment = new FeatureLayer({
    url: "https://services3.arcgis.com/DAf01WuIltSLujAv/arcgis/rest/services/portland_eoc_inventory/FeatureServer/2",
    outFields: ["*"]
  });
  map.add(equipment);

  // Example queries triggered from buttons
  window.runShelterQuery = function() {
    const query = shelters.createQuery();
    query.where = "available > 0";
    shelters.queryFeatures(query).then(function(result) {
      alert("Shelters available: " + result.features.length);
    });
  };

  window.runClosureQuery = function() {
    const query = roads.createQuery();
    query.where = "status = 'Closed'";
    roads.queryFeatures(query).then(function(result) {
      alert("Closed roads: " + result.features.length);
    });
  };

  window.runEquipmentQuery = function() {
    const query = equipment.createQuery();
    query.where = "capacity_pct < 50";
    equipment.queryFeatures(query).then(function(result) {
      alert("Low capacity equipment: " + result.features.length);
    });
  };

  // Simple live NWS alert banner
  fetch("https://api.weather.gov/alerts/active?area=TX")
    .then(r => r.json())
    .then(data => {
      const alerts = data.features.map(f => f.properties.headline).slice(0,3);
      if(alerts.length > 0) {
        document.getElementById("alert-bar").textContent = "🚨 " + alerts.join(" | ");
      } else {
        document.getElementById("alert-bar").textContent = "✅ No active Texas alerts";
      }
    })
    .catch(err => console.error(err));
});
