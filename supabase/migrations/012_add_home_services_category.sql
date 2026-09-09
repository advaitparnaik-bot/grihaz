-- Add home_services to expense_platform_category enum
alter type expense_platform_category add value if not exists 'home_services';
