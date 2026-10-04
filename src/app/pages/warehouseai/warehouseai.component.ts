import { Component } from '@angular/core';
import { AssistantService } from './assistant.service';
import { AnalystService, AnalystRow } from './analyst.service';

interface ChatMessage {
  role: string;
  content: string;
  rows?: AnalystRow[];
  showTable?: boolean;
}

@Component({
  selector: 'app-warehouseai',
  standalone: false,
  templateUrl: './warehouseai.component.html',
  styleUrl: './warehouseai.component.css'
})
export class WarehouseaiComponent {

  isChatOpen = false;
  chatMessages: ChatMessage[] = [];
  currentMessage = '';
  isTyping = false;

  constructor(
    private assistantService: AssistantService,
    private analystService: AnalystService
  ) {}

  toggleChat(): void {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen && this.chatMessages.length === 0) {
      this.chatMessages.push({ role: 'ai', content: 'Hi there! I am your AI assistant. How can I help you?' });
    }
  }

  sendMessage(): void {
    if (!this.currentMessage.trim()) return;

    const userMessage = this.currentMessage;
    const history = this.chatMessages.slice(-10).map(m => ({ role: m.role, content: m.content }));

    this.chatMessages.push({ role: 'user', content: userMessage });
    this.currentMessage = '';
    this.isTyping = true;

    // Step 1: route through LLM1 for intent classification
    this.assistantService.sendMessage(userMessage, history).subscribe({
      next: (res) => {
        if (res.data.dataRequired) {
          // Step 2: data query detected — hand off to LLM2 with conversation history
          this.routeToLLM2(userMessage, history);
        } else {
          this.isTyping = false;
          this.chatMessages.push({ role: 'ai', content: res.data.reply });
        }
      },
      error: () => {
        this.isTyping = false;
        this.chatMessages.push({
          role: 'ai',
          content: "Sorry, I'm having trouble connecting right now. Please make sure the assistant service is running and try again."
        });
      }
    });
  }

  private routeToLLM2(question: string, history: Array<{ role: string; content: string }> = []): void {
    this.analystService.query(question, history).subscribe({
      next: (res) => {
        this.isTyping = false;
        const hasRows = res.data.rows && res.data.rows.length > 0;
        this.chatMessages.push({
          role: 'ai',
          content: res.data.reply,
          rows: hasRows ? res.data.rows : [],
          showTable: false
        });
      },
      error: () => {
        this.isTyping = false;
        this.chatMessages.push({
          role: 'ai',
          content: "I couldn't fetch data right now. Please ensure the data analyst service is running on port 4301."
        });
      }
    });
  }

  getTableKeys(rows: AnalystRow[]): string[] {
    if (!rows || rows.length === 0) return [];
    return Object.keys(rows[0]);
  }

  toggleTable(msg: ChatMessage): void {
    msg.showTable = !msg.showTable;
  }

}
