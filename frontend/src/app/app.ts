import { Component, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ScraperService, BusinessData } from './scraper';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements OnDestroy {
  nombreNegocio = 'Kraftwerk Tacoronte';
  datos: BusinessData | null = null;
  cargando = false;
  error = '';
  private destroy$ = new Subject<void>();

  constructor(
    private scraperService: ScraperService,
    private cdr: ChangeDetectorRef
  ) {}

  buscar() {
    if (!this.nombreNegocio.trim()) return;
    
    this.cargando = true;
    this.error = '';
    this.datos = null;
    
    console.log('🔍 Iniciando búsqueda:', this.nombreNegocio);
    
    this.scraperService.scrapeBusiness(this.nombreNegocio)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (respuesta: BusinessData) => {
          console.log('✅ Respuesta recibida del servidor:', respuesta);
          this.datos = respuesta;
          this.cargando = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('❌ Error en la solicitud:', err);
          console.error('Estado:', err.status);
          console.error('Mensaje:', err.message);
          this.error = `Error: ${err.status ? err.status + ' - ' : ''}${err.statusText || err.message || 'Error desconocido'}. Asegúrate de que el servidor Node está corriendo en http://localhost:3000`;
          this.cargando = false;
          this.cdr.markForCheck();
        }
      });
  }

  copiarEnlace() {
    if (this.datos?.urlGoogle) {
      navigator.clipboard.writeText(this.datos.urlGoogle);
      alert('✅ Enlace copiado al portapapeles');
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}