import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ChatHistoryItem {
  role: string;
  content: string;
}

export interface AssistantReply {
  reply: string;
  suggestions?: string[];
  dataRequired?: boolean;
}

export interface AssistantResponse {
  success: boolean;
  data: AssistantReply;
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
export class AssistantService {
  private readonly baseUrl = 'http://localhost:4300';
  private readonly apiUrl = `${this.baseUrl}/api/assistant/chat`;

  constructor(private http: HttpClient) {}

  sendMessage(message: string, history: ChatHistoryItem[]): Observable<AssistantResponse> {
    return this.http.post<AssistantResponse>(this.apiUrl, { message, history });
  }

  getUsage(): Observable<TokenUsageResponse> {
    return this.http.get<TokenUsageResponse>(`${this.baseUrl}/api/usage`);
  }
}
