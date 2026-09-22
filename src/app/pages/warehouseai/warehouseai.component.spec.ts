import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WarehouseaiComponent } from './warehouseai.component';

describe('WarehouseaiComponent', () => {
  let component: WarehouseaiComponent;
  let fixture: ComponentFixture<WarehouseaiComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [WarehouseaiComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WarehouseaiComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
