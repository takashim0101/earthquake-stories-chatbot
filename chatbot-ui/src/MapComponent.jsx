import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Leaflet デフォルトアイコン修正
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
});

// 静的データ
const locationData = {
    latitude: -43.5321,
    longitude: 172.6362,
    location: "Christchurch, New Zealand",
    storySummary: "Location of the major earthquake on February 22, 2011."
};

const MapComponent = () => {
    const position = [locationData.latitude, locationData.longitude];

    return (
        <div className="map-section" style={{ height: '500px', width: '100%' }}>
            <MapContainer
                center={position}
                zoom={12}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={position}>
                    <Popup>
                        <div>
                            <h4>Story: {locationData.location}</h4>
                            <p>{locationData.storySummary}</p>
                        </div>
                    </Popup>
                </Marker>
            </MapContainer>
        </div>
    );
};

export default MapComponent;



