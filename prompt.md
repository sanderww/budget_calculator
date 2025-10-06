I need a HTML page which is a cost calculator in south african rands for understanding current budget
The page needs to display the following
Current savings amount
Debt with option add multiple amounts with description
Provisions with option add multiple amounts with description and expected date
future costs with option add multiple with a date
current net amount which is savings minus all debt, provisions
future net amount with a date which is savings minus all debt, provisions and all future costs depending on the date entered

I want to preload data from a csv file called calulator_data.csv
I want to be able to save all changes to the csv
this includes adding, changing and removing the amounts

as soon as I change anything on the page, amounts should change so I can play around (and choose to save)
example csv

the file needs to be loaded from this project root. When saving changes, the changes need to be done on the same file. No downloading of new file


type,description,amount,date
savings,,423000,
debt,emily rent,10500,
provision,general provision,100000, 2025-09-15
costfuturecost, new car, 240000, 2025-09-15
costfuturecost, rent tax 2025, 25000, 2026-06-01
costfuturecost, pool fix, 75000, 2026-03-01

