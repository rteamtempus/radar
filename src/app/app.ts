import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { PlatformService } from './core/platform/platform.service';
import { UpdateService } from './core/update.service';
import { ToastService } from './shared/ui/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly updates = inject(UpdateService);
  protected readonly toast = inject(ToastService);
  private readonly platform = inject(PlatformService);

  constructor() {
    this.platform.init();
    this.platform.registerBackButton(['/radar', '/explore', '/party', '/friends', '/profile', '/login']);
  }
}
