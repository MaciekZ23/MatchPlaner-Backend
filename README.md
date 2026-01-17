# MatchPlanner - Backend

Backend aplikacji **MatchPlanner** odpowiedzialny jest za logikę biznesową systemu zarządzania turniejami piłkarskimi, obsługę użytkowników, meczów, tabel, faz pucharowych oraz głosowania MVP.

Aplikacja została zaimplementowana w architekturze modularnej z wykorzystaniem frameworka NestJS oraz ORM Prisma.

## Funkcje

- Zarządzanie turniejami, grupami i etapami rozgrywek
- Obsługa drużyn oraz zawodników
- Tworzenie i edycja meczów wraz ze zdarzeniami
- Automatyczne generowanie terminarzy (round-robin)
- Obsługa fazy pucharowej (playoffs)
- Wyliczanie tabel i klasyfikacji grupowych
- Głosowanie MVP meczu (użytkownicy i goście)
- Autoryzacja JWT oraz logowanie przez Google OAuth
- Testy jednostkowe i end-to-end

## Technologie

- [NestJS](https://nestjs.com/)
- [TypeScript](https://www.typescriptlang.org/)
- [Prisma ORM](https://www.prisma.io/)
- PostgreSQL
- JWT (JSON Web Tokens)
- Google OAuth 2.0

## Struktura projektu

- `src/auth` – autoryzacja, JWT, role użytkowników
- `src/modules/tournaments` – zarządzanie turniejami
- `src/modules/teams` – drużyny i zawodnicy
- `src/modules/matches` – mecze i zdarzenia meczowe
- `src/modules/standings` – tabele i klasyfikacje grupowe
- `src/modules/playoffs` – faza pucharowa
- `src/modules/voting` – głosowanie MVP meczu
- `src/database` – konfiguracja Prisma i dostęp do bazy
- `src/common` – filtry, pipe’y, narzędzia wspólne
- `test` – testy end-to-end

## Wymagania

- Node.js (zalecana wersja >= 18)
- npm
- PostgreSQL (lokalnie lub zdalnie)

## Instalacja lokalna

1. Sklonuj repozytorium projektu backendu: `https://github.com/MaciekZ23/MatchPlaner-Backend.git`
2. Przejdź do katalogu projektu: `cd MatchPlanner-Backend`
3. Zainstaluj zależności: `npm install`
4. Skonfiguruj zmienne środowiskowe:
   DATABASE_URL=postgresql://user:password@localhost:5432/matchplanner
   JWT_SECRET=your_jwt_secret
   GOOGLE_CLIENT_ID=your_google_client_id
5. Wykonaj migracje bazy danych: `npx prisma migrate deploy`
6. Uruchom aplikację backendową w trybie deweloperskim: `npm run start:dev`

## Testy

W projekcie zastosowano dwa rodzaje testów: testy jednostkowe oraz testy end-to-end backendu.

Testy jednostkowe zostały zaimplementowane z wykorzystaniem frameworka Jest i obejmują weryfikację logiki poszczególnych serwisów aplikacji.

1. Przykładowe uruchomienie testów jednostkowych dla wybranego modułu: `npm run test -- "src/modules/teams/teams.service.spec.ts"`

Testy end-to-end backendu zostały zrealizowane z wykorzystaniem Jest oraz biblioteki Supertest i polegają na testowaniu interfejsu REST API aplikacji.

Testy E2E uruchamiają rzeczywistą instancję aplikacji NestJS
i weryfikują pełny przepływ danych: od żądania HTTP,
przez kontrolery i serwisy, aż po operacje na bazie danych.

2. Przykładowe uruchomienie testu E2E dla wybranego modułu: `npm run test:e2e -- tournament.e2e-spec.ts`
