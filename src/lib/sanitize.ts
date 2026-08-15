/** FMD/Rule/XREF names and every exported file name must be space-free — collapse any run of
 * whitespace into a single underscore instead. */
export const sanitizeName = (value: string): string => value.trim().replace(/\s+/g, '_');
