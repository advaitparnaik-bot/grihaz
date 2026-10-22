-- Add travel to expense_platform_category enum
alter type expense_platform_category add value if not exists 'travel';
