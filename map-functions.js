// Map Functions
import { updateRegStatus } from "./utils.js";

let map = null;
let marker = null;
let zoneCreatorMap = null;
let currentMapPolygon = null;
let selectedLocation = null;

export function getMap() { return map; }
export function getMarker() { return marker; }
export function getZoneCreatorMap() { return zoneCreatorMap; }
export function getSelectedLocation() { return selectedLocation; }
export function setSelectedLocation(location) { selectedLocation = location; }

export function initMap() {
    const defaultPos = { lat: 12.9716, lng: 77.5946 };
    map = new google.maps.Map(document.getElementById("map"), { center: defaultPos, zoom: 12 });
    marker = new google.maps.Marker({ map: null, title: "Selected Location" });
    map.addListener("click", (e) => {
        const newPos = e.latLng;
        marker.setPosition(newPos); 
        marker.setMap(map); 
        if (currentMapPolygon && google.maps.geometry.poly.containsLocation(newPos, currentMapPolygon)) {
            selectedLocation = { lat: newPos.lat(), lng: newPos.lng() };
            updateRegStatus("Location selected. Ready to register.", false);
        } else {
            selectedLocation = null; 
            updateRegStatus("Error: Camera must be placed inside the selected toll zone.", true);
        }
    });
}

export function initZoneCreatorMap() {
    const defaultPos = { lat: 12.9716, lng: 77.5946 };
    zoneCreatorMap = new google.maps.Map(document.getElementById('zone-creator-map'), { center: defaultPos, zoom: 12 });
    const drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: true,
        drawingControlOptions: { position: google.maps.ControlPosition.TOP_CENTER, drawingModes: ['polygon'] },
        polygonOptions: { fillColor: '#0d6efd', fillOpacity: 0.2, strokeWeight: 2, strokeColor: '#0d6efd', editable: true },
    });
    drawingManager.setMap(zoneCreatorMap);
    
    return { map: zoneCreatorMap, drawingManager };
}

export function displayZoneOnMap(zone) {
    if (!map) return;
    if (currentMapPolygon) currentMapPolygon.setMap(null);
    if (marker) marker.setMap(null); 
    selectedLocation = null; 
    currentMapPolygon = new google.maps.Polygon({
        paths: zone.coordinates, strokeColor: "#0d6efd", strokeOpacity: 0.8,
        strokeWeight: 2, fillColor: "#0d6efd", fillOpacity: 0.05, map: map, clickable: false 
    });
}

export function getCurrentMapPolygon() {
    return currentMapPolygon;
}

