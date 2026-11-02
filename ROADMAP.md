# Roadmap

This document describes the planned development of the **CO₂ Absorption Calculator** after the
first public release. It is a statement of intent, not a commitment: priorities may change based
on feedback, data availability and contributor time.

> 🇵🇹 Um resumo em português encontra-se [no fim deste documento](#-resumo-em-português).

**Last updated:** November 2026 · **Current version:** 1.0 (web rebuild)

---

## Contents

- [Guiding principles](#guiding-principles)
- [Status legend](#status-legend)
- [Current release — v1.0](#current-release--v10)
- [Phase 1 — Release hardening (v1.1)](#phase-1--release-hardening-v11)
- [Phase 2 — Scientific confidence (v1.2)](#phase-2--scientific-confidence-v12)
- [Phase 3 — Analysis & insight (v1.3)](#phase-3--analysis--insight-v13)
- [Phase 4 — Deployment & automation (v2.0)](#phase-4--deployment--automation-v20)
- [Ongoing — Documentation & academic outputs](#ongoing--documentation--academic-outputs)
- [Out of scope](#out-of-scope)
- [How to contribute or give feedback](#how-to-contribute-or-give-feedback)

---

## Guiding principles

1. **Scientific transparency first.** Every number shown must be traceable to a documented method,
   data source and parameter set. New features should not hide assumptions.
2. **Honest uncertainty.** Estimates from remote sensing are approximations; the tool should say
   how approximate.
3. **Free and open data.** The core workflow must keep working with free accounts (Copernicus Data
   Space, NASA POWER, ESA WorldCover).
4. **Reproducibility.** The original thesis result for Oeiras (June 2024) must always remain
   reproducible within 1 %.
5. **Bilingual by default.** Every user-facing feature ships in Portuguese and English.

## Status legend

| Status | Meaning |
|---|---|
| ✅ Done | Released |
| 🚧 In progress | Actively being worked on |
| 📋 Planned | Scoped and scheduled for the phase |
| 💡 Proposed | Under consideration; feedback welcome |

Effort estimates: **S** ≈ under a day · **M** ≈ a few days · **L** ≈ a week or more.

---

## Current release — v1.0

The Windows (Tkinter) thesis application was rebuilt as a web application that works for any
region.

| Feature | Status |
|---|---|
| Region input: draw, place search (OpenStreetMap), GeoJSON / zipped shapefile upload | ✅ |
| CASA model with literature-based parameters (Zhu et al. 2006; Fensholt & Sandholt 2003) | ✅ |
| Sentinel-2 L2A cloud-masked monthly composites via Copernicus openEO | ✅ |
| ESA WorldCover 2021 read directly from public Cloud-Optimised GeoTIFFs | ✅ |
| Monthly climate from NASA POWER, with 5-year climatology fallback | ✅ |
| Background job queue with live progress and Copernicus queue status | ✅ |
| Interactive map layers, per-pixel values, land-cover breakdown, monthly chart | ✅ |
| PDF (PT/EN), CSV and GeoTIFF exports | ✅ |
| Thesis method reproduction (Oeiras, June 2024: 20,384 t vs 20,228 t) | ✅ |
| Secure in-app Copernicus credential management and monthly credit usage | ✅ |

---

## Phase 1 — Release hardening (v1.1)

**Goal:** a reliable, easy-to-run first release that others can install and trust.

| # | Item | Description | Effort | Status |
|---|---|---|---|---|
| 1.1 | Verified Docker image | Build and test the container image in CI; publish to GitHub Container Registry. | S | 📋 |
| 1.2 | One-click full year | Queue all 12 months of a year in one action, with a Copernicus credit estimate shown before starting (≈ 9 credits per month for a municipality-sized region). | S | 📋 |
| 1.3 | End-to-end tests | Playwright tests covering region creation, a run with cached data, and exports in both languages. | M | 📋 |
| 1.4 | Export verification | Automated checks of PDF/CSV/ZIP contents and translations. | S | 📋 |
| 1.5 | Mobile layout | Review and adapt the map and results pages for small screens. | S | 📋 |

**Exit criteria:** `docker compose up` works on a clean machine; CI runs unit and end-to-end tests
on every pull request.

---

## Phase 2 — Scientific confidence (v1.2)

**Goal:** make the reliability of each estimate visible and independently checkable.

| # | Item | Description | Effort | Status |
|---|---|---|---|---|
| 2.1 | Uncertainty range | Report results as an interval (e.g. *16,752 t ± 15 %*) by varying the main assumptions — NDVI references, maximum light-use efficiency, climate input — in a Monte Carlo sensitivity run. Shown in the dashboard and exports. | M | 📋 |
| 2.2 | ERA5 climate source | Optional ERA5-Land monthly data (Copernicus Climate Data Store), available within days, replacing the climatology fallback used while NASA POWER is still unpublished (≈ 2–3 months delay). | M | 📋 |
| 2.3 | External validation | Compare annual results against MODIS MOD17 NPP for the same area; show the comparison on the Method page. | M | 📋 |
| 2.4 | Data-quality flags | Clear per-month indicators: cloud-free coverage, composite window extension, climate fallback. | S | 📋 |

**Exit criteria:** every result shows a range and its data-quality flags; a documented validation
for at least the Oeiras reference region.

---

## Phase 3 — Analysis & insight (v1.3)

**Goal:** turn monthly numbers into information useful for local planning.

| # | Item | Description | Effort | Status |
|---|---|---|---|---|
| 3.1 | Year-over-year comparison | Compare months and annual totals between years for the same region. | S | 📋 |
| 3.2 | Absorption hotspots | Map layer highlighting the highest-absorbing areas, with totals per sub-area (e.g. parishes). | S | 📋 |
| 3.3 | Sourced emissions | Suggest annual emissions from public inventories (EDGAR, APA for Portugal), with the source cited in results. | S | 💡 |
| 3.4 | Land-use scenarios | Draw an area and simulate a land-cover change (e.g. new tree cover) to estimate the additional CO₂ absorbed. | M | 💡 |
| 3.5 | Shareable results | Read-only public result pages and a summary image for sharing. | S | 💡 |

---

## Phase 4 — Deployment & automation (v2.0)

**Goal:** a hosted public demonstration that keeps itself up to date.

| # | Item | Description | Effort | Status |
|---|---|---|---|---|
| 4.1 | Hosted demo | Public deployment with the demo password protecting write actions, HTTPS and backups. | M | 📋 |
| 4.2 | Scheduled updates | Automatically compute the previous month for saved regions once data is available. | M | 💡 |
| 4.3 | Notifications | Optional e-mail when a run or scheduled update finishes. | S | 💡 |
| 4.4 | Multi-user accounts | Individual accounts with private regions and per-user credentials. | L | 💡 |

---

## Ongoing — Documentation & academic outputs

| Item | Description | Status |
|---|---|---|
| Method comparison note | Short report in `docs/` comparing the thesis method with the improved model on Oeiras (20,384 t vs 16,752 t), explaining each difference. | 📋 |
| Project reports in the app | Link the original reports and posters from the About page. | 📋 |
| API documentation | Usage examples for the REST API alongside the generated OpenAPI docs. | 💡 |

---

## Out of scope

To keep the project focused, the following are **not** planned:

- Certified carbon accounting or carbon-credit verification — results are estimates for education,
  research and planning support.
- Soil carbon, ocean or wetland sediment carbon fluxes.
- Commercial satellite imagery or paid data sources as a requirement.

---

## How to contribute or give feedback

- **Ideas and requests:** open an [issue](../../issues) describing the use case. Items marked 💡 are
  especially open to discussion.
- **Bugs:** open an issue with the region (or GeoJSON), month and the run's error message.
- **Code:** fork the repository, create a branch, and open a pull request. Please run
  `uv run pytest` and `uv run ruff check` in `backend/` and `npm run build` in `frontend/`
  before submitting.

---

## 🇵🇹 Resumo em português

Este roteiro descreve as próximas fases de desenvolvimento da aplicação:

| Fase | Versão | Objetivo |
|---|---|---|
| 1 — Robustez | v1.1 | Imagem Docker testada, cálculo de um ano completo com um clique e estimativa de créditos, testes de ponta a ponta, versão móvel |
| 2 — Confiança científica | v1.2 | Intervalo de incerteza nos resultados, dados climáticos ERA5, validação com MODIS, indicadores de qualidade dos dados |
| 3 — Análise | v1.3 | Comparação entre anos, zonas de maior absorção, emissões de inventários públicos, cenários de alteração do uso do solo |
| 4 — Publicação | v2.0 | Demonstração online, atualizações mensais automáticas, notificações, contas de utilizador |

Sugestões são bem-vindas através das [issues](../../issues) do repositório.
