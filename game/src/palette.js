// The look plan, in one place: dusk over a rail yard. Deep blue-grey sky, sodium
// orange lamps, slate containers, amber for the Ravens, pale steel blue for the
// Nightwatch. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#1a2029', // dusk sky
  surface: '#232a33', // steel and concrete
  hairline: '#39424d', // container ribs
  ink: '#e9e6df', // warm off-white
  muted: '#8b98a5', // cool grey-blue
  accent: '#f0a830', // sodium lamp amber
  rust: '#a4552f', // rusted container
  teal: '#3f6d6b', // painted container teal
  olive: '#5c6238', // painted container olive
  nightwatch: '#7fa8c9', // defender steel blue
  ravens: '#e8a33d', // attacker amber
  danger: '#e05a4e', // bomb light, damage flash
  smoke: '#c8ccd2', // smoke cloud
};

export function shade(name) {
  return PALETTE[name];
}
