import { Component } from '@angular/core';

/** Milestone 5: enter a 6-char code (or arrive via /party/join?code=XXXXXX) → join_party RPC. */
@Component({
  selector: 'pp-party-join-page',
  template: `
    <div class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <div class="text-4xl">🔑</div>
      <h1 class="font-display text-2xl font-semibold">Join a party</h1>
      <p class="text-sm text-muted-2">Coming in milestone 5.</p>
    </div>
  `,
})
export class PartyJoinPage {}
