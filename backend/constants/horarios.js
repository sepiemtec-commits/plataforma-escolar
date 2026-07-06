const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const SLOTS_POR_TURNO = {
  'Manhã': ['07:30', '08:20', '09:10', '10:00', '10:50', '11:40'],
  'Tarde': ['13:00', '13:50', '14:40', '15:30', '16:20', '17:10'],
  'Noite': ['18:00', '18:50', '19:40', '20:30', '21:20']
};

function slotsDoTurno(turno) {
  if (turno === 'Integral') return SLOTS_POR_TURNO['Manhã'];
  return SLOTS_POR_TURNO[turno] || SLOTS_POR_TURNO['Manhã'];
}

module.exports = {
  DIAS_SEMANA,
  SLOTS_POR_TURNO,
  slotsDoTurno
};
