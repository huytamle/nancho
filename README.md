# THE HEAT PIZZA — `theheatpizza.vn`

Ứng dụng đặt món một trang (mobile-first, giao diện tối) cho mô hình "nướng theo mẻ, đặt trước mới làm".

- Kiến trúc, đặc tả, lộ trình M0–M6: [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md)
- Marketing: [`docs/MARKETING.md`](docs/MARKETING.md)
- Quy tắc cho AI Agent: [`AGENTS.md`](AGENTS.md)

## Chạy dự án

Yêu cầu Node.js ≥ 22.12.

```bash
npm install
cp .env.example .env.local   # điền giá trị (từ M2 trở đi)
npm run dev
```

| Lệnh | Việc |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm test` | Unit test (Vitest) cho `lib/domain` |
| `npm run build` | Build production |
| `npm run test:e2e` | E2E (Playwright, cần `npm run build` trước) |
| `npm run db:generate` / `db:migrate` / `db:seed` | Database (từ M2) |

## Route

- `/` — app đặt món (hiện là trang giữ chỗ, M3 sẽ thay)
- `/tai-quan` — quán ăn tại chỗ THE HEAT: Café, KOLD Gelato, đặt bàn
