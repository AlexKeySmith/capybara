export const FIXTURES = {
  classic: {
    name: 'Classic Skirmish',
    summary: 'Four-player chaotic arena with seeded terrain and three AI placeholders for remote joiners.',
    timeLimit: 120,
    showBeaconTicks: 360,
  },
  training: {
    name: 'Target Range',
    summary: 'Slower pace for validating touch controls, timing, and seeded smoke tests.',
    timeLimit: 180,
    showBeaconTicks: 999,
  },
  showcase: {
    name: 'Showcase',
    summary: 'Deterministic presentation fixture for browser screenshots and visual checks.',
    timeLimit: 240,
    showBeaconTicks: 999,
  },
};

export function resolveFixture(name) {
  return FIXTURES[name] || FIXTURES.classic;
}
