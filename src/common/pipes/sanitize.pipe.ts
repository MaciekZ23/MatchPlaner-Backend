import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

/**
 * Pipe odpowiedzialny za sanityzację danych wejściowych
 * Usuwa potencjalnie niebezpieczne znaczniki HTML, skrypty
 * oraz znaki kontrolne z danych przesyłanych przez użytkownika
 *
 * Mechanizm ten zabezpiecza aplikację przed atakami XSS
 * oraz niepożądanym kodem wprowadzanym w polach tekstowych
 *
 * Pipe działa rekurencyjnie na stringach, obiektach oraz tablicach,
 * pomijając dane binarne np. pliki
 */
@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (
      metadata.type === 'custom' ||
      value instanceof Buffer ||
      value?.buffer instanceof Buffer
    ) {
      return value;
    }

    return this.clean(value);
  }

  private clean(input: any): any {
    if (input == null) return input;

    if (typeof input === 'string') {
      const trimmed = input.replace(/[\u0000-\u001F\u007F]+/g, '').trim();

      // NIE naruszamy znaków Unicode
      const sanitized = sanitizeHtml(trimmed, {
        allowedTags: [],
        allowedAttributes: {},
        disallowedTagsMode: 'discard',
        parser: {
          decodeEntities: false,
        },
      });

      return sanitized.replace(/\s{2,}/g, ' ');
    }

    if (Array.isArray(input)) {
      return input.map((v) => this.clean(v));
    }

    if (typeof input === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(input)) {
        out[k] = this.clean(v);
      }
      return out;
    }

    return input;
  }
}
