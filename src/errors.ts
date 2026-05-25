export class VeylixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VeylixError';
  }
}

export class VeylixAPIError extends VeylixError {
  public statusCode: number;
  public responseData: any;

  constructor(message: string, statusCode: number, responseData?: any) {
    super(message);
    this.name = 'VeylixAPIError';
    this.statusCode = statusCode;
    this.responseData = responseData;
  }
}

export class VeylixAuthError extends VeylixAPIError {
  constructor(message: string = 'Authentication failed. Invalid or missing API key.', responseData?: any) {
    super(message, 401, responseData);
    this.name = 'VeylixAuthError';
  }
}

export interface ApiResponse<T> {
  data: T | null;
  error: VeylixAPIError | null;
}
