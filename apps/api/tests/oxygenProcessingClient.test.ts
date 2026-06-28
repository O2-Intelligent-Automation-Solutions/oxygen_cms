import { describe, expect, it } from 'vitest';
import { MAX_PROCESSING_TAKE, parseProcessingDataSourceRequest } from '../src/processing/processingDataSourceRequest.js';
import { assertValidServiceIdentifier } from '../src/processing/oxygenProcessingClient.js';

describe('OxyGen Processing DataSourceRequest handling', () => {
  it('defaults and clamps take without dropping Kendo query semantics', () => {
    const defaulted = parseProcessingDataSourceRequest({});
    expect(defaulted).toMatchObject({ skip: 0, take: 50 });

    const clamped = parseProcessingDataSourceRequest({ skip: '10', take: '9999', sort: 'Id-asc', filter: "Status~eq~'Errored'", unexpected: '/web-api/global/settings' });
    expect(clamped).toMatchObject({ skip: 10, take: MAX_PROCESSING_TAKE, sort: 'Id-asc', filter: "Status~eq~'Errored'" });
    expect(clamped.unexpected).toBeUndefined();
  });

  it('validates service identifiers as single safe path tokens', () => {
    expect(() => assertValidServiceIdentifier('WHE')).not.toThrow();
    expect(() => assertValidServiceIdentifier('EMM_Service-1')).not.toThrow();
    expect(() => assertValidServiceIdentifier('../WHE')).toThrow('Invalid service identifier.');
    expect(() => assertValidServiceIdentifier('WHE/Events')).toThrow('Invalid service identifier.');
    expect(() => assertValidServiceIdentifier('WHE?path=/web-api/global/settings')).toThrow('Invalid service identifier.');
  });
});
