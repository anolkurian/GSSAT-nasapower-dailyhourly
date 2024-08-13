library(jsonlite)
load("nasaidSoils.rda")
json_data <- toJSON(data)
write(json_data, "nasaidSoils.json")