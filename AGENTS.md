# indicaciones

- Antes de trabajar código, revisa la documentación usando el MCP Context7.
- Mantener el estándar de código limpio.
- Evitar poner código CSS en archivos que no sean .css (solo se permite `style=""` para variables CSS como `--bg-image`).
- Usa siempre pnpm como gestor de paquetes (nunca npm/yarn).
- Después de editar código, ejecuta `pnpm format:check` (o `pnpm format` si hay que corregir).
- Verifica los cambios con `pnpm build` antes de terminar.
- Los textos de la interfaz y los comentarios van en español (`<html lang="es">`).
- No cambies los finales de línea: el proyecto usa CRLF (Windows).

# estructura del proyecto

- `src/layouts/Layout.astro`: layout global (head, import de Bootstrap, ClientRouter). Toda página lo usa.
- `src/pages/`: páginas (index, consumo, presupuesto) y `robots.txt.ts`.
- `src/components/`: Navbar y Footer, incluidos en las páginas.
- `src/assets/styles/consumo.css`: hoja de estilos global del sitio.
- `src/assets/img/`: imágenes del proyecto (se importan en los `.astro` para que Astro las optimice).

# convenciones

- Astro en modo estático, sin adapter. `trailingSlash: "always"`: los enlaces internos llevan barra final (`/consumo/`).
- Usa Bootstrap 5.3 (clases y componentes) e iconos `bi bi-*` de bootstrap-icons. Tema oscuro (`data-bs-theme="dark"`).
- Navegación con `astro:transitions` / `ClientRouter` (ya configurado en el Layout).
- TypeScript estricto (`astro/tsconfigs/strict`): respeta los tipos.
- `sharp` es dependencia directa requerida por `astro:assets` con pnpm: no eliminarla.
- `pnpm-workspace.yaml` habilita los scripts de build de esbuild/sharp: no eliminarlo.
- No edites archivos generados: `dist/`, `.astro/`, `pnpm-lock.yaml`.
- Despliegue en Cloudflare Pages (https://timbertec.pages.dev): build = `pnpm build`, salida `dist`.

# tecnologias usadas

- Astro
- Bootstrap
- Bootstrap-icons
- Lite-youtube-embed
- @astrojs/sitemap
- pnpm
- Prettier + prettier-plugin-astro
- sharp

