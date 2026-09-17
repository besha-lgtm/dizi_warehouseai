import { Component } from '@angular/core';

@Component({
  selector: 'app-expense-review',
  standalone: false,
  templateUrl: './expense-review.component.html',
  styleUrls: ['./expense-review.component.css']
})
export class ExpenseReviewComponent {
  isUploaded = false;
  isAnalyzing = false;
  isPosted = false;
  zoomLevel = 100;
  rotation = 0;

  selectedFileName = '';
  selectedFileSize = '';

  triggerUpload(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFileName = file.name;
      this.selectedFileSize = (file.size / 1024).toFixed(1) + ' KB';
      this.isAnalyzing = true;

      // Simulate AI validate and OCR extraction
      setTimeout(() => {
        this.isAnalyzing = false;
        this.isUploaded = true;
      }, 2000);
    }
  }

  zoomIn(): void {
    if (this.zoomLevel < 150) {
      this.zoomLevel += 10;
    }
  }

  zoomOut(): void {
    if (this.zoomLevel > 50) {
      this.zoomLevel -= 10;
    }
  }

  rotate(): void {
    this.rotation = (this.rotation + 90) % 360;
  }

  postToERP(): void {
    this.isPosted = true;
  }

  rejectDocument(): void {
    this.reset();
  }

  reset(): void {
    this.isUploaded = false;
    this.isAnalyzing = false;
    this.isPosted = false;
    this.zoomLevel = 100;
    this.rotation = 0;
    this.selectedFileName = '';
    this.selectedFileSize = '';
  }
}
