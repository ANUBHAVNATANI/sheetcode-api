const express = require('express')
const router = express.Router()

const Question = require('../models/question')

// requiring google sheets api config
const initGoogleSheets = require('../config/googlesheets-config')

/* As a general rule of thumb, GET routes are good candidates for lean() in a RESTful API. 
On the other hand, PUT, POST, etc. routes generally should not use lean(). */

router.get('/', async (req, res) => {
	let dbQuery = {}
	if ('category' in req.query) {
		dbQuery['category'] = req.query.category
	}
	if ('difficulty' in req.query) {
		dbQuery['difficulty'] = req.query.difficulty
	}

	try {
		let foundQuestions = await Question.find(dbQuery, { __v: 0, name_fuzzy: 0 }).lean()
		res.json(foundQuestions)
	} catch (err) {
		res.json({ error: err.message })
	}
})

router.post('/', async (req, res) => {
	let { name, problem_link, category, difficulty, user_column, solution_link } = req.body
	let solutions = [{ link: solution_link, user_column }]
	let newQuestion = { name, link: problem_link, category, difficulty, solutions }
	try {
		let foundQuestion = await Question.findOne({ link: problem_link }, { __v: 0 })
		let flag = false
		if (foundQuestion) {
			for (let solution of foundQuestion.solutions) {
				if (solution.user_column === user_column) {
					flag = true
					solution.link = solution_link
					await foundQuestion.save()
				}
			}
			if (flag === true) {
				res.json(foundQuestion)
			} else {
				let updatedQuestion = await Question.findOneAndUpdate(
					{ link: problem_link },
					{ $push: { solutions: { link: solution_link, user_column } } },
					{ __v: 0 }
				)

				res.json(updatedQuestion)
			}

			const sheet = await initGoogleSheets()
			let rowA1Index = foundQuestion._id.toString()
			await sheet.loadCells(`${user_column}${rowA1Index}:${user_column}${rowA1Index}`)
			const solutionCell = sheet.getCellByA1(`${user_column}${rowA1Index}`)
			solutionCell.value = solution_link
			await solutionCell.save()
		} else {
			const sheet = await initGoogleSheets()
			const newRow = await sheet.addRow({
				'Problem Name': name,
				'Problem Link': problem_link,
				Category: category,
				Difficulty: difficulty
			})
			let newRowA1Index = newRow.rowIndex
			// console.log(typeof newRowA1Index)

			let createdQuestion = await Question.create({ ...newQuestion, _id: newRowA1Index })
			delete createdQuestion.__v
			res.json(createdQuestion)

			let userColumnStart = String.fromCharCode(65 + env.get('ZERO_BASED_USER_COLUMN_START').asInt())
			let userColumnEnd = String.fromCharCode(65 + env.get('ZERO_BASED_USER_COLUMN_END').asInt())
			await sheet.loadCells(`${userColumnStart}${newRowA1Index}:${userColumnEnd}${newRowA1Index}`)
			const solutionCell = sheet.getCellByA1(`${user_column}${newRowA1Index}`)
			solutionCell.value = solution_link
			await solutionCell.save()
		}
	} catch (err) {
		res.json({ error: err.message })
	}
})

router.patch('/', async (req, res) => {
	let { _id, user_column, solution_link } = req.body

	try {
		let foundQuestion = await Question.findById(_id)
		// console.log(foundQuestion)
		let flag = false
		for (let solution of foundQuestion.solutions) {
			if (solution.user_column === user_column) {
				flag = true
				solution.link = solution_link
				await foundQuestion.save()
			}
		}
		if (flag === true) {
			res.json(foundQuestion)
		} else {
			let updatedQuestion = await Question.findByIdAndUpdate(_id, { $push: { solutions: { link: solution_link, user_column } } })
			res.json(updatedQuestion)
		}

		const sheet = await initGoogleSheets()
		let rowA1Index = _id.toString()
		await sheet.loadCells(`${user_column}${rowA1Index}:${user_column}${rowA1Index}`)
		const solutionCell = sheet.getCellByA1(`${user_column}${rowA1Index}`)
		solutionCell.value = solution_link
		await solutionCell.save()
	} catch (err) {
		res.json({ error: err.message })
	}
})

module.exports = router