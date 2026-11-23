export const experiences = [
  { id: 'piscina', name: 'Pase de piscina', category: 'Bienestar', description: 'Acceso a la piscina durante el turno elegido.', image: '/assets/piscina.jpg', price: 65, capacity: 16, slots: ['10:00', '14:00'] },
  { id: 'cena', name: 'Cena en el resort', category: 'Gastronomía', description: 'Reserva una mesa para compartir al final del día.', image: '/assets/bar.jpg', price: 110, capacity: 12, slots: ['18:30', '20:00'] },
  { id: 'cocteleria', name: 'Degustación de coctelería', category: 'Gastronomía', description: 'Prueba una selección de bebidas en el bar del resort.', image: '/assets/bar1.jpg', price: 85, capacity: 10, slots: ['17:00', '19:00'] },
  { id: 'tiwanaku', name: 'Excursión a Tiwanaku', category: 'Excursiones', description: 'Salida grupal al entorno arqueológico de Tiwanaku.', image: '/assets/viaje2.jpg', price: 180, capacity: 12, slots: ['08:00'] },
  { id: 'charquini', name: 'Excursión a Charquini', category: 'Excursiones', description: 'Salida grupal al paisaje de montaña de Charquini.', image: '/assets/viaje1.jpg', price: 210, capacity: 10, slots: ['07:00'] },
];

export const categoryFor = (id) => experiences.find(item => item.id === id);

export const nextPayment = {
  pendiente: { cobrar: 'cobrada' },
  reembolso_pendiente: { reembolsar: 'reembolsada' },
};
