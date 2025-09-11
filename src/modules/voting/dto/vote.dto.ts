// Payload oddania głosu
export class VoteRequestDto {
  matchId!: string;
  playerId!: string;
}

// Odpowiedź po oddaniu głosu
export class VoteResponseDto {
  ok!: true;
  matchId!: string;
  playerId!: string;
}
