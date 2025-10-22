import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: any, _metadata: ArgumentMetadata) {
    return this.clean(value);
  }

  private clean(input: any): any {
    if (input == null) return input;

    if (typeof input === 'string') {
      // 1) usuń znaki sterujące i trim
      const trimmed = input.replace(/[\u0000-\u001F\u007F]/g, '').trim();

      // 2) minimalna sanityzacja HTML (wyłączona prawie cała treść HTML)
      const sanitized = sanitizeHtml(trimmed, {
        allowedTags: [], // nic HTML nie przepuszczamy
        allowedAttributes: {},
        // usuń komentarze, skrypty itp.
        disallowedTagsMode: 'discard',
      });

      // 3) zredukuj wielokrotne spacje do jednej
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
