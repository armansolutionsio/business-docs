'use strict';

import { useEffect, useRef } from 'react';

export default function ContactoMapa({ contacto }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const L = window.L;
    if (!L) return;

    const lat = contacto.latitud || -34.6;
    const lng = contacto.longitud || -58.4;
    const hasCoords = contacto.latitud && contacto.longitud;

    const map = L.map(mapRef.current).setView([lat, lng], hasCoords ? 15 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    if (hasCoords) {
      const marker = L.marker([lat, lng]).addTo(map);
      marker.bindPopup(`<strong>${contacto.nombre || 'Contacto'}</strong><br/>${contacto.domicilio || ''}<br/>${contacto.localidad || ''}`).openPopup();
    }

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [contacto]);

  if (!contacto.latitud || !contacto.longitud) {
    return <div className="empty-msg">Este contacto no tiene coordenadas cargadas</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
        {contacto.domicilio && `${contacto.domicilio}, `}{contacto.localidad || ''}, {contacto.provincia || ''}
        <span style={{ marginLeft: 8, color: '#94a3b8' }}>({contacto.latitud}, {contacto.longitud})</span>
      </div>
      <div ref={mapRef} style={{ width: '100%', height: 400, borderRadius: 8, border: '1px solid var(--border)' }}></div>
    </div>
  );
}
