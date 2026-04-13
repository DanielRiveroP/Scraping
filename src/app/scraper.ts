import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Resena {
  autor: string;
  puntuacion: number;
  fecha: string;
  texto: string;
}

export interface BusinessData {
  nombre: string;
  puntuacion: string;
  numeroResenas: string;
  horario: string;
  telefono: string;
  sitioWeb: string;
  urlGoogle: string;
  resenas?: Resena[];
}

@Injectable({
  providedIn: 'root'
})
export class ScraperService {
  private apiUrl = 'http://localhost:3000/api/scrape';

  constructor(private http: HttpClient) {}

  scrapeBusiness(companyName: string): Observable<BusinessData> {
    // Asegurar que el nombre se envía correctamente
    const body = { companyName: companyName };
    console.log('📤 Enviando al servidor:', body);
    return this.http.post<BusinessData>(this.apiUrl, body);
  }
}