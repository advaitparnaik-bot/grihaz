drop view if exists expense_monthly_platform_summary;

alter type expense_platform_category rename to expense_platform_category_old;

create type expense_platform_category as enum ('grocery', 'shopping', 'restaurant', 'fashion_apparel');

alter table expense_orders 
  alter column category type expense_platform_category 
  using category::text::expense_platform_category;

drop type expense_platform_category_old;