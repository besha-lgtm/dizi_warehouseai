import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AnalystRow {
  [key: string]: string | number | boolean | null;
}

export interface AnalystResult {
  reply: string;
  rows: AnalystRow[];
  sql: string | null;
  cannotAnswer: boolean;
}

export interface AnalystResponse {
  success: boolean;
  data: AnalystResult;
}

export interface TokenUsage {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
}

export interface TokenUsageResponse {
  success: boolean;
  data: TokenUsage;
}

@Injectable({ providedIn: 'root' })
export class AnalystService {
  private readonly baseUrl = 'http://localhost:4301';
  private readonly apiUrl = `${this.baseUrl}/api/analyst/query`;

  constructor(private http: HttpClient) {}

  query(question: string, history: Array<{ role: string; content: string }> = []): Observable<AnalystResponse> {
    return this.http.post<AnalystResponse>(this.apiUrl, { question, history });
  }

  getUsage(): Observable<TokenUsageResponse> {
    return this.http.get<TokenUsageResponse>(`${this.baseUrl}/api/usage`);
  }
}
