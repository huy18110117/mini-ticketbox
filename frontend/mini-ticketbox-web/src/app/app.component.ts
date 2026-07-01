import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

type ThemeMode = 'light' | 'dark';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'mini-ticketbox-web';

  readonly theme = signal<ThemeMode>('dark');
  readonly isDarkTheme = computed(() => this.theme() === 'dark');

  ngOnInit(): void {
    this.theme.set(this.getInitialTheme());
    this.applyTheme(this.theme());
  }

  toggleTheme(): void {
    const nextTheme = this.theme() === 'dark' ? 'light' : 'dark';

    this.theme.set(nextTheme);
    this.applyTheme(nextTheme);
    localStorage.setItem('mini-ticketbox-theme', nextTheme);
  }

  private getInitialTheme(): ThemeMode {
    const savedTheme = localStorage.getItem('mini-ticketbox-theme');

    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }

  private applyTheme(theme: ThemeMode): void {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  }
}
