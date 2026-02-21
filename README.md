# Threescope

A Three.js port of [TLEscope](https://github.com/aweeri/TLEscope) by [aweeri](https://github.com/aweeri) — a satellite visualization tool that transforms Two-Line Element (TLE) sets into interactive 3D and 2D views.

This version runs entirely in the browser as a static web app with PWA support, making it installable and usable offline on any device.

## Attribution

Threescope is a derivative work of **TLEscope**, originally developed in C with Raylib by **aweeri**. The original project's design, algorithms, and visual style are the foundation of this port.

- Original project: [github.com/aweeri/TLEscope](https://github.com/aweeri/TLEscope)
- TLE data provided by [CelesTrak](https://celestrak.org)

## License

This project is licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html), the same license as the original TLEscope.

## Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Output goes to `dist/`, deployable to any static host.
