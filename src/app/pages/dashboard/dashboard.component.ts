import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, timer } from 'rxjs';
import { AssistantService, TokenUsage } from '../warehouseai/assistant.service';
import { AnalystService } from '../warehouseai/analyst.service';

const REFRESH_INTERVAL_MS = 8000;

@Component({
  selector: 'app-dashboard',
  standalone: false,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {

  llm1Usage: TokenUsage | null = null;
  llm2Usage: TokenUsage | null = null;

  private refreshSub?: Subscription;

  constructor(
    private assistantService: AssistantService,
    private analystService: AnalystService
  ) {}

  ngOnInit(): void {
    this.refreshSub = timer(0, REFRESH_INTERVAL_MS).subscribe(() => this.refreshUsage());
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  private refreshUsage(): void {
    this.assistantService.getUsage().subscribe({
      next: (res) => (this.llm1Usage = res.data),
      error: () => (this.llm1Usage = null)
    });

    this.analystService.getUsage().subscribe({
      next: (res) => (this.llm2Usage = res.data),
      error: () => (this.llm2Usage = null)
    });
  }
}
