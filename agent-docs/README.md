# Unified Agent Documentation

Bo tai lieu agent da duoc gom ve mot diem vao duy nhat trong thu muc `agent-docs/`.

## Cau truc

- `implementation/`
  - Bo tai lieu source of truth cho product, architecture, repo structure, API, data model, admin UI, rule engine, watcher, implementation plan, test plan, acceptance criteria va deployment.
- `handoff/`
  - Bo tai lieu handoff de agent tiep quan tren VPS/live environment theo huong an toan, co backup, co inventory va khong lam mat session dang nhap hien co.

## Cach dung

### Neu agent dang lam viec trong codebase / local implementation
Doc theo thu tu:

1. `implementation/AGENT_START_HERE.md`
2. `implementation/README.md`
3. Toan bo `implementation/docs/` theo thu tu danh so

### Neu agent dang tiep quan VPS / production-like environment
Doc theo thu tu:

1. `implementation/AGENT_START_HERE.md`
2. `implementation/README.md`
3. `handoff/README.md`
4. `handoff/docs/00-handoff-summary.md`
5. Toan bo `handoff/docs/` theo thu tu danh so

## Nguyen tac to chuc

- `implementation/` giu vai tro source of truth cho pham vi san pham va cach xay he thong.
- `handoff/` bo sung execution rules khi agent lam viec tren VPS/live environment.
- Khong con hai bundle tach roi o root repo; agent chi can bat dau tu `agent-docs/README.md`.
